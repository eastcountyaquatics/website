// Handles Stripe's checkout.session.completed webhook and writes the
// resulting purchase(s) into public.purchases — this is the piece that
// replaces manual re-entry into QuickBooks. Uses the service role key so
// it can write on behalf of any user; RLS never allows a browser client
// to do this itself.
//
// Deploy: supabase functions deploy stripe-webhook --no-verify-jwt
// (must be --no-verify-jwt since Stripe calls this directly, with no
// Supabase auth token — the Stripe signature check below is what secures it)
//
// Secrets required: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
// SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// After deploying, register the webhook URL in the Stripe dashboard
// (Developers -> Webhooks) for the checkout.session.completed,
// customer.subscription.updated, customer.subscription.deleted, and
// invoice.paid events, then copy the signing secret into
// STRIPE_WEBHOOK_SECRET. invoice.paid is what records every Masters
// membership charge (first month and every renewal) into purchases --
// without it, Masters revenue never shows up in Sign-Ups or the
// QuickBooks export.

import Stripe from "npm:stripe@^17";
import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return new Response("Missing stripe-signature header", { status: 400 });
  }

  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
    apiVersion: "2024-06-20",
  });

  const rawBody = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      Deno.env.get("STRIPE_WEBHOOK_SECRET")!
    );
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return new Response("Invalid signature", { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Stripe sends subscription lifecycle events (pause/resume happen via
  // our own manage-masters-subscription function and update the DB
  // directly, but a failed payment or an external cancellation only ever
  // shows up here) separately from checkout.session.completed.
  if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    return await handleMastersSubscriptionEvent(supabase, event.data.object as Stripe.Subscription);
  }

  // Every Masters charge -- the first month and every renewal after it --
  // is its own invoice, and Stripe pays+fires invoice.paid for all of them
  // uniformly (including the very first one created by Checkout). This is
  // the one place a purchases row is recorded for Masters revenue; nothing
  // is inserted from checkout.session.completed below, or the first month
  // would be double-counted.
  if (event.type === "invoice.paid") {
    return await handleMastersInvoicePaid(supabase, event.data.object as Stripe.Invoice);
  }

  if (event.type !== "checkout.session.completed") {
    // Not an event we care about; acknowledge so Stripe stops retrying.
    return new Response("ignored", { status: 200 });
  }

  const session = event.data.object as Stripe.Checkout.Session;

  // Tournament invite payments carry a different metadata shape (no
  // Supabase user_id, since the family never logs in) -- handle that
  // branch separately from season/team registration.
  if (session.metadata?.tournament_invite_token) {
    return await handleTournamentPayment(supabase, session);
  }

  if (session.mode === "subscription" && session.metadata?.masters_tier) {
    return await handleMastersCheckout(supabase, session);
  }

  const userId = session.metadata?.user_id;
  const registrationsJson = session.metadata?.registrations;

  if (!userId || !registrationsJson) {
    console.error("Webhook missing expected metadata on session", session.id);
    return new Response("missing metadata", { status: 200 });
  }

  let registrations: Array<{
    athlete_id: string;
    athlete_name: string;
    registration_option_id: string;
    registration_label: string;
  }>;
  try {
    registrations = JSON.parse(registrationsJson);
  } catch {
    console.error("Could not parse registrations metadata for session", session.id);
    return new Response("bad metadata", { status: 200 });
  }

  // A multi-item checkout produced one PaymentIntent for the whole cart —
  // split the total evenly across line items isn't right if prices differ,
  // so re-fetch each option's real amount instead of guessing from the total.
  const optionIds = [...new Set(registrations.map((r) => r.registration_option_id))];
  const { data: options } = await supabase
    .from("registration_options")
    .select("id, amount_cents")
    .in("id", optionIds);
  const amountByOption = new Map((options ?? []).map((o) => [o.id, o.amount_cents]));

  let consentResponses: unknown = null;
  if (session.metadata?.consent) {
    try {
      consentResponses = JSON.parse(session.metadata.consent);
    } catch {
      console.error("Could not parse consent metadata for session", session.id);
    }
  }

  // Stripe delivers webhooks at-least-once -- a repeat delivery of the same
  // session would otherwise insert a second, duplicate set of purchase rows.
  // stripe_checkout_session_id is what ties a delivery back to "have we
  // already recorded this"; same guard as the tournament/Masters branches.
  const { data: alreadyRecorded } = await supabase
    .from("purchases")
    .select("id")
    .eq("stripe_checkout_session_id", session.id)
    .limit(1)
    .maybeSingle();
  if (alreadyRecorded) {
    return new Response("already processed", { status: 200 });
  }

  const rows = registrations.map((r) => ({
    user_id: userId,
    athlete_id: r.athlete_id,
    registration_option_id: r.registration_option_id,
    description: `${r.registration_label} — ${r.athlete_name}`,
    amount_cents: amountByOption.get(r.registration_option_id) ?? 0,
    currency: (session.currency ?? "usd").toLowerCase(),
    // Must match the purchases_status_check constraint:
    // pending | paid | refunded | canceled
    status: "paid",
    stripe_checkout_session_id: session.id,
    stripe_payment_intent_id:
      typeof session.payment_intent === "string" ? session.payment_intent : null,
    consent_responses: consentResponses,
  }));

  const { error } = await supabase.from("purchases").insert(rows);
  if (error) {
    console.error("Failed to insert purchases for session", session.id, error);
    // Return 500 so Stripe retries the webhook.
    return new Response("db insert failed", { status: 500 });
  }

  return new Response("ok", { status: 200 });
});

async function handleTournamentPayment(
  supabase: ReturnType<typeof createClient>,
  session: Stripe.Checkout.Session
) {
  const token = session.metadata!.tournament_invite_token!;

  const { data: invite, error: inviteError } = await supabase
    .from("tournament_invites")
    .select("id, tournament_id, athlete_id, status")
    .eq("token", token)
    .maybeSingle();
  if (inviteError || !invite) {
    console.error("Tournament webhook: invite not found for token", token);
    return new Response("invite not found", { status: 200 });
  }

  // Stripe delivers webhooks at-least-once, so the same event can arrive
  // more than once. The invite's own status is the idempotency guard: once
  // marked paid, a repeat delivery is a no-op instead of a duplicate charge
  // record.
  if (invite.status === "paid") {
    return new Response("already processed", { status: 200 });
  }

  const tournamentId = session.metadata!.tournament_id ?? invite.tournament_id;
  const athleteId = session.metadata!.athlete_id ?? invite.athlete_id;
  const tierLabel = session.metadata!.tier_label ?? "";
  const payerName = session.metadata!.payer_name || null;
  const payerEmail = session.metadata!.payer_email || null;

  const { data: athlete } = await supabase
    .from("athletes")
    .select("full_name")
    .eq("id", athleteId)
    .maybeSingle();
  const { data: tournament } = await supabase
    .from("tournaments")
    .select("name")
    .eq("id", tournamentId)
    .maybeSingle();

  const description = `${tournament?.name ?? "Tournament"} — ${athlete?.full_name ?? "Athlete"}${tierLabel ? ` (${tierLabel})` : ""}`;

  const { error: purchaseError } = await supabase.from("purchases").insert({
    user_id: null,
    athlete_id: athleteId,
    tournament_id: tournamentId,
    tournament_invite_id: invite.id,
    description,
    amount_cents: session.amount_total ?? 0,
    currency: (session.currency ?? "usd").toLowerCase(),
    status: "paid",
    stripe_checkout_session_id: session.id,
    stripe_payment_intent_id:
      typeof session.payment_intent === "string" ? session.payment_intent : null,
    payer_name: payerName,
    payer_email: payerEmail,
  });
  if (purchaseError) {
    console.error("Failed to insert tournament purchase for session", session.id, purchaseError);
    return new Response("db insert failed", { status: 500 });
  }

  const { error: updateError } = await supabase
    .from("tournament_invites")
    .update({ status: "paid", paid_at: new Date().toISOString() })
    .eq("id", invite.id);
  if (updateError) {
    console.error("Failed to mark invite paid for session", session.id, updateError);
    // The purchase row is already recorded; don't make Stripe retry just
    // because this status flip failed.
  }

  return new Response("ok", { status: 200 });
}

async function handleMastersCheckout(
  supabase: ReturnType<typeof createClient>,
  session: Stripe.Checkout.Session
) {
  const userId = session.metadata!.user_id;
  const tier = session.metadata!.masters_tier;
  if (!userId || !tier || typeof session.subscription !== "string") {
    console.error("Masters checkout webhook missing expected fields on session", session.id);
    return new Response("missing metadata", { status: 200 });
  }

  const { error } = await supabase.from("masters_subscriptions").upsert(
    {
      user_id: userId,
      tier,
      stripe_customer_id: typeof session.customer === "string" ? session.customer : null,
      stripe_subscription_id: session.subscription,
      status: "active",
    },
    { onConflict: "stripe_subscription_id" }
  );
  if (error) {
    console.error("Failed to record masters subscription for session", session.id, error);
    return new Response("db insert failed", { status: 500 });
  }

  return new Response("ok", { status: 200 });
}

async function handleMastersInvoicePaid(
  supabase: ReturnType<typeof createClient>,
  invoice: Stripe.Invoice
) {
  const subscriptionId = typeof invoice.subscription === "string" ? invoice.subscription : null;
  if (!subscriptionId) {
    // Not a subscription invoice -- nothing for us to do with it.
    return new Response("no subscription on invoice", { status: 200 });
  }

  const { data: sub } = await supabase
    .from("masters_subscriptions")
    .select("user_id, tier")
    .eq("stripe_subscription_id", subscriptionId)
    .maybeSingle();
  if (!sub) {
    // Extremely narrow race: this invoice.paid event arrived before the
    // checkout.session.completed webhook created the subscription row.
    // Nothing to attribute the purchase to yet -- Stripe still has the
    // payment on record, so this can be reconciled by hand if it ever
    // actually happens, rather than guessing at a user to attach it to.
    console.error("Masters invoice.paid: no matching subscription for", subscriptionId);
    return new Response("no matching subscription", { status: 200 });
  }

  const paymentIntentId = typeof invoice.payment_intent === "string" ? invoice.payment_intent : null;

  // Idempotency: Stripe delivers webhooks at-least-once.
  if (paymentIntentId) {
    const { data: existing } = await supabase
      .from("purchases")
      .select("id")
      .eq("stripe_payment_intent_id", paymentIntentId)
      .maybeSingle();
    if (existing) return new Response("already processed", { status: 200 });
  }

  const tierLabel = sub.tier === "25_under" ? "25 & Under" : "26+";
  const { error } = await supabase.from("purchases").insert({
    user_id: sub.user_id,
    description: `Masters Membership (${tierLabel})`,
    amount_cents: invoice.amount_paid ?? 0,
    currency: (invoice.currency ?? "usd").toLowerCase(),
    status: "paid",
    stripe_payment_intent_id: paymentIntentId,
  });
  if (error) {
    console.error("Failed to insert masters purchase for invoice", invoice.id, error);
    return new Response("db insert failed", { status: 500 });
  }

  return new Response("ok", { status: 200 });
}

async function handleMastersSubscriptionEvent(
  supabase: ReturnType<typeof createClient>,
  sub: Stripe.Subscription
) {
  // NOTE: this status-mapping logic is duplicated in
  // manage-masters-subscription -- keep both copies in sync.
  const status = mapSubscriptionStatus(sub);
  const { error } = await supabase
    .from("masters_subscriptions")
    .update({
      status,
      current_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
    })
    .eq("stripe_subscription_id", sub.id);
  if (error) {
    console.error("Failed to sync masters subscription status for", sub.id, error);
    // A row might not exist yet if this event raced the checkout webhook;
    // that's fine, the checkout handler will set the correct status.
  }
  return new Response("ok", { status: 200 });
}

function mapSubscriptionStatus(sub: Stripe.Subscription): string {
  if (sub.pause_collection) return "paused";
  if (sub.status === "canceled" || sub.status === "incomplete_expired") return "canceled";
  if (sub.status === "past_due" || sub.status === "unpaid") return "past_due";
  if (sub.status === "active" || sub.status === "trialing") return "active";
  return "pending";
}

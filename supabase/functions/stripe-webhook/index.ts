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
// (Developers -> Webhooks) for the checkout.session.completed event, then
// copy the signing secret into STRIPE_WEBHOOK_SECRET.

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

  if (event.type !== "checkout.session.completed") {
    // Not an event we care about; acknowledge so Stripe stops retrying.
    return new Response("ignored", { status: 200 });
  }

  const session = event.data.object as Stripe.Checkout.Session;
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

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // A multi-item checkout produced one PaymentIntent for the whole cart —
  // split the total evenly across line items isn't right if prices differ,
  // so re-fetch each option's real amount instead of guessing from the total.
  const optionIds = [...new Set(registrations.map((r) => r.registration_option_id))];
  const { data: options } = await supabase
    .from("registration_options")
    .select("id, amount_cents")
    .in("id", optionIds);
  const amountByOption = new Map((options ?? []).map((o) => [o.id, o.amount_cents]));

  const rows = registrations.map((r) => ({
    user_id: userId,
    athlete_id: r.athlete_id,
    registration_option_id: r.registration_option_id,
    description: `${r.registration_label} — ${r.athlete_name}`,
    amount_cents: amountByOption.get(r.registration_option_id) ?? 0,
    currency: (session.currency ?? "usd").toLowerCase(),
    status: "succeeded",
    stripe_checkout_session_id: session.id,
    stripe_payment_intent_id:
      typeof session.payment_intent === "string" ? session.payment_intent : null,
  }));

  const { error } = await supabase.from("purchases").insert(rows);
  if (error) {
    console.error("Failed to insert purchases for session", session.id, error);
    // Return 500 so Stripe retries the webhook.
    return new Response("db insert failed", { status: 500 });
  }

  return new Response("ok", { status: 200 });
});

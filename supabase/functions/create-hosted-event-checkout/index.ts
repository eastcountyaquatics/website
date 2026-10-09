// Public, no login required: creates a Stripe Checkout Session for one
// hosted-event invite (an outside team paying to attend a tournament or
// scrimmage this club is hosting). Re-validates the token and re-reads the
// fee from the database server-side, same reasoning as
// create-tournament-checkout: never trust an amount the browser sends.
//
// The club picks which of the event's age groups it's bringing and how many
// teams in each (body.teams: [{level, count}]); each age group is priced
// from the event -- one fee per team, or its own price when the event is
// priced by age group -- and saved on the invite as registered_teams.
//
// Deploy: supabase functions deploy create-hosted-event-checkout --no-verify-jwt
// Secrets required: STRIPE_SECRET_KEY, SITE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import Stripe from "npm:stripe@^17";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const token = String(body.token || "").trim();
    const contactEmail = String(body.contact_email || "").trim();
    // Teams invited by email only (Admin > Hosted Events) give their team
    // name here, the first time they open their link.
    const teamNameInput = String(body.team_name || "").trim().slice(0, 200);
    if (!token) return json({ error: "Missing token" }, 400);
    if (!contactEmail || !contactEmail.includes("@")) return json({ error: "Enter a valid email address" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: invite, error: inviteError } = await supabase
      .from("hosted_event_invites")
      .select("id, event_id, team_name, status")
      .eq("token", token)
      .maybeSingle();
    if (inviteError || !invite) return json({ error: "This invite link is not valid." }, 404);
    if (invite.status === "paid") {
      return json({ error: "This invite has already been paid." }, 409);
    }

    const { data: event, error: eventError } = await supabase
      .from("hosted_events")
      .select("id, name, event_date, end_date, additional_dates, levels, fee_cents, price_by_level, level_prices")
      .eq("id", invite.event_id)
      .maybeSingle();
    if (eventError || !event) return json({ error: "This event could not be found." }, 404);

    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
    const lastDate = [event.event_date, event.end_date].concat(event.additional_dates || []).filter(Boolean).sort().pop();
    if (lastDate && today > lastDate) {
      return json({ error: "This event has already taken place." }, 409);
    }

    const teamName = (invite.team_name || "").trim() || teamNameInput;
    if (!teamName) return json({ error: "Enter your team or club name." }, 400);

    // Which teams they're bringing, priced from the event itself.
    const levels: string[] = (event.levels && event.levels.length) ? event.levels : ["Team"];
    const priceFor = (level: string): number | null => {
      if (!event.price_by_level) return event.fee_cents;
      const row = (event.level_prices || []).find((p: { level: string }) => p.level === level);
      return row ? Number(row.fee_cents) : null;
    };
    const picked: { level: string; count: number }[] = Array.isArray(body.teams)
      ? body.teams.map((t: { level?: unknown; count?: unknown }) => ({ level: String(t?.level ?? ""), count: Math.floor(Number(t?.count)) }))
      // A page loaded before age-group signup existed sends no teams: one team.
      : (event.price_by_level ? [] : [{ level: levels[0], count: 1 }]);
    const registered: { level: string; count: number; fee_cents: number }[] = [];
    for (const t of picked) {
      if (!t.count) continue;
      if (levels.indexOf(t.level) === -1) return json({ error: `"${t.level}" isn't an option for this event.` }, 400);
      if (!(t.count >= 1 && t.count <= 10)) return json({ error: "Choose between 1 and 10 teams for each age group." }, 400);
      if (registered.some((r) => r.level === t.level)) continue;
      const fee = priceFor(t.level);
      if (!fee || fee <= 0) return json({ error: `There's no price set for ${t.level} yet. Please contact the club.` }, 422);
      registered.push({ level: t.level, count: t.count, fee_cents: fee });
    }
    if (!registered.length) return json({ error: "Pick at least one team to sign up." }, 400);
    const amountCents = registered.reduce((sum, r) => sum + r.fee_cents * r.count, 0);

    // Keep the contact email on file current -- whoever actually pays is
    // the reachable contact, which can differ from whoever was first invited.
    await supabase.from("hosted_event_invites").update({
      contact_email: contactEmail,
      registered_teams: registered,
      amount_cents: amountCents,
      ...((invite.team_name || "").trim() ? {} : { team_name: teamName }),
    }).eq("id", invite.id);

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
      apiVersion: "2024-06-20",
    });

    const siteUrl = Deno.env.get("SITE_URL") ?? "https://eastcountyaquatics.github.io/website";
    const returnUrl = `${siteUrl}/hosted-event-signup.html?token=${encodeURIComponent(token)}`;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      // Card and bank account (ACH) only -- the club turned off the other
      // wallets/pay-later options. Bank payments clear in a few business days;
      // stripe-webhook waits for checkout.session.async_payment_succeeded.
      payment_method_types: ["card", "us_bank_account"],
      line_items: registered.map((r) => ({
        price_data: {
          currency: "usd",
          unit_amount: r.fee_cents,
          product_data: {
            name: `${event.name} — ${teamName}` + (r.level === "Team" ? "" : ` — ${r.level}`),
          },
        },
        quantity: r.count,
      })),
      customer_email: contactEmail,
      success_url: `${returnUrl}&checkout=success`,
      cancel_url: `${returnUrl}&checkout=cancelled`,
      metadata: {
        hosted_event_invite_token: token,
        hosted_event_invite_id: invite.id,
      },
    });

    return json({ url: session.url });
  } catch (err) {
    console.error(err);
    return json({ error: "Something went wrong creating checkout" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

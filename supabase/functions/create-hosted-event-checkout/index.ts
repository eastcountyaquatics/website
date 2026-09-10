// Public, no login required: creates a Stripe Checkout Session for one
// hosted-event invite (an outside team paying to attend a tournament or
// scrimmage this club is hosting). Re-validates the token and re-reads the
// fee from the database server-side, same reasoning as
// create-tournament-checkout: never trust an amount the browser sends.
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
      .select("id, name, event_date, fee_cents")
      .eq("id", invite.event_id)
      .maybeSingle();
    if (eventError || !event) return json({ error: "This event could not be found." }, 404);

    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
    if (event.event_date && today > event.event_date) {
      return json({ error: "This event has already taken place." }, 409);
    }

    // Keep the contact email on file current -- whoever actually pays is
    // the reachable contact, which can differ from whoever was first invited.
    await supabase.from("hosted_event_invites").update({ contact_email: contactEmail }).eq("id", invite.id);

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
      apiVersion: "2024-06-20",
    });

    const siteUrl = Deno.env.get("SITE_URL") ?? "https://eastcountyaquatics.github.io/website";
    const returnUrl = `${siteUrl}/hosted-event-signup.html?token=${encodeURIComponent(token)}`;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: event.fee_cents,
            product_data: {
              name: `${event.name} — ${invite.team_name}`,
            },
          },
          quantity: 1,
        },
      ],
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

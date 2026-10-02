// Public, no login required: returns the details for the printable
// receipt shown on sponsor.html / donate.html right after Stripe Checkout
// redirects back. The donor proves it's their receipt by holding the
// Checkout Session id Stripe put in the success URL -- an unguessable
// token only they (and Stripe) ever see. Everything on the receipt comes
// from Stripe (what was actually charged) plus the sponsorship row the
// session points at, never from the browser.
//
// This deliberately does NOT write anything: stripe-webhook stays the one
// place that flips a sponsorship to paid and sends the emailed receipt, so
// the two can never race each other into a skipped email.
//
// Deploy: supabase functions deploy get-donation-receipt --no-verify-jwt
// Secrets required: STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Optional: ORG_EIN (defaults to the club's EIN below)

import Stripe from "npm:stripe@^17";
import { createClient } from "npm:@supabase/supabase-js@2";

const ORG_NAME = "San Diego East County Aquatics";
const DEFAULT_EIN = "85-0673706";

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
    const sessionId = String(body.session_id || "").trim();
    if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId)) {
      return json({ error: "Missing or invalid receipt reference." }, 400);
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
      apiVersion: "2024-06-20",
    });

    let session: Stripe.Checkout.Session;
    try {
      session = await stripe.checkout.sessions.retrieve(sessionId);
    } catch (_err) {
      return json({ error: "This receipt could not be found." }, 404);
    }

    const sponsorshipId = session.metadata?.sponsorship_id;
    if (!sponsorshipId) {
      return json({ error: "This receipt could not be found." }, 404);
    }
    if (session.payment_status !== "paid") {
      return json({ error: "This payment hasn't completed yet." }, 409);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { data: sponsorship } = await supabase
      .from("sponsorships")
      .select("id, is_donation, company_name, contact_name, contact_email, org_name, tier, paid_at")
      .eq("id", sponsorshipId)
      .maybeSingle();
    if (!sponsorship) {
      return json({ error: "This receipt could not be found." }, 404);
    }

    const paidAt = sponsorship.paid_at ?? new Date(session.created * 1000).toISOString();

    return json({
      receipt_number: "ECA-" + sponsorship.id.replace(/-/g, "").slice(0, 8).toUpperCase(),
      is_donation: sponsorship.is_donation,
      donor_name: sponsorship.is_donation ? sponsorship.contact_name : sponsorship.company_name,
      contact_name: sponsorship.contact_name,
      email: sponsorship.contact_email || session.customer_details?.email || null,
      org_name: sponsorship.org_name,
      tier: sponsorship.tier,
      amount_cents: session.amount_total ?? 0,
      currency: (session.currency || "usd").toUpperCase(),
      paid_at: paidAt,
      org: {
        name: ORG_NAME,
        ein: Deno.env.get("ORG_EIN") || DEFAULT_EIN,
        address: "El Cajon, CA",
        email: "eastcountyaquatics@gmail.com",
      },
    });
  } catch (err) {
    console.error(err);
    return json({ error: "Something went wrong loading your receipt." }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

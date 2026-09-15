// Public, no login required: creates a Stripe Checkout Session for a
// sponsorship someone just submitted through sponsor.html. The amount and
// company details come from the database row (looked up by id), never
// trusted from the request body -- the same pattern as
// create-tournament-checkout, for the same reason: the browser is not a
// trustworthy source for how much someone is about to be charged.
//
// Deploy: supabase functions deploy create-sponsorship-checkout --no-verify-jwt
// Secrets required: STRIPE_SECRET_KEY, SITE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Optional: RESEND_API_KEY, RECEIPT_EMAIL_FROM (club notification email --
// see notifyClub below; a silent no-op with no key set, same as the
// receipt emails in stripe-webhook)

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
    const sponsorshipId = String(body.sponsorship_id || "").trim();
    if (!sponsorshipId) return json({ error: "Missing sponsorship_id" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: sponsorship, error } = await supabase
      .from("sponsorships")
      .select("id, company_name, contact_name, contact_email, contact_phone, tier, amount_cents, website_url, logo_url, blurb, status")
      .eq("id", sponsorshipId)
      .maybeSingle();
    if (error || !sponsorship) {
      return json({ error: "This sponsorship submission could not be found." }, 404);
    }
    if (sponsorship.status === "paid") {
      return json({ error: "This sponsorship has already been paid." }, 409);
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
      apiVersion: "2024-06-20",
    });

    const siteUrl = Deno.env.get("SITE_URL") ?? "https://eastcountyaquatics.github.io/website";
    const returnUrl = `${siteUrl}/sponsor.html`;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: sponsorship.amount_cents,
            product_data: {
              name: `Sponsorship — ${sponsorship.company_name}`,
            },
          },
          quantity: 1,
        },
      ],
      customer_email: sponsorship.contact_email,
      success_url: `${returnUrl}?status=success`,
      cancel_url: `${returnUrl}?status=cancelled`,
      metadata: {
        sponsorship_id: sponsorship.id,
      },
    });

    // Record the session id now (not just on webhook success) so a second
    // submission attempt on this same row can't create a second Stripe
    // session out from under the first one; the guard trigger still allows
    // the webhook to flip status -> paid afterward.
    await supabase
      .from("sponsorships")
      .update({ stripe_checkout_session_id: session.id })
      .eq("id", sponsorship.id);

    // The club previously had no way to know a sponsorship came in short of
    // manually checking Admin > Sponsors -- notify as soon as someone
    // submits, not just once they've paid, so an abandoned checkout is
    // still visible instead of disappearing silently.
    await notifyClub(
      "New sponsorship submitted: " + sponsorship.company_name,
      "A new sponsorship was just submitted, checkout in progress.\n\n" +
        `Company: ${sponsorship.company_name}\n` +
        `Contact: ${sponsorship.contact_name || "(not given)"}\n` +
        `Email: ${sponsorship.contact_email}\n` +
        `Phone: ${sponsorship.contact_phone || "(not given)"}\n` +
        `Level: ${sponsorship.tier || "(not given)"}\n` +
        `Amount: $${(sponsorship.amount_cents / 100).toFixed(2)}\n` +
        `Website: ${sponsorship.website_url || "(not given)"}\n` +
        `Logo: ${sponsorship.logo_url || "(not given)"}\n` +
        `Message: ${sponsorship.blurb || "(not given)"}\n\n` +
        "You'll get a separate note once payment actually completes."
    );

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

// Best-effort notification to the club, same pattern as the receipt emails
// in stripe-webhook -- never allowed to fail the checkout it's attached to,
// and a silent no-op until RESEND_API_KEY is set.
async function notifyClub(subject: string, text: string): Promise<void> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return;
  const from = Deno.env.get("RECEIPT_EMAIL_FROM") || "San Diego East County Aquatics <onboarding@resend.dev>";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: ["eastcountyaquatics@gmail.com"], subject, text }),
    });
    if (!res.ok) {
      console.error("Resend club notification failed:", res.status, await res.text());
    }
  } catch (err) {
    console.error("Resend club notification threw:", err);
  }
}

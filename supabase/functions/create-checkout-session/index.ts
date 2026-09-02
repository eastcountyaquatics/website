// Creates a Stripe Checkout Session for one or more (athlete, registration
// option) pairs in a single "cart" — supports registering multiple kids
// at once. Runs with the caller's own JWT so RLS enforces that the
// athletes actually belong to them; never touches the Stripe secret key
// from the browser.
//
// Deploy: supabase functions deploy create-checkout-session
// Secrets required: STRIPE_SECRET_KEY, SITE_URL (e.g. https://eastcountyaquatics.github.io/website)

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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Missing Authorization header" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      return json({ error: "Not signed in" }, 401);
    }
    const user = userData.user;

    const body = await req.json();
    const items = Array.isArray(body.items) ? body.items : [];
    if (items.length === 0) {
      return json({ error: "No items provided" }, 400);
    }
    if (items.length > 10) {
      return json({ error: "Too many items in one checkout" }, 400);
    }

    // Verify every athlete belongs to this user (RLS on the athletes table
    // enforces this too, but check explicitly for a clean error message).
    const athleteIds = [...new Set(items.map((i: any) => i.athlete_id))];
    const { data: athletes, error: athletesError } = await supabase
      .from("athletes")
      .select("id, full_name")
      .in("id", athleteIds);
    if (athletesError || !athletes || athletes.length !== athleteIds.length) {
      return json({ error: "One or more athletes could not be verified" }, 400);
    }
    const athleteById = new Map(athletes.map((a: any) => [a.id, a]));

    // Look up each registration option (must be open) to get the real
    // Stripe price + label, rather than trusting the client's amount.
    const optionIds = [...new Set(items.map((i: any) => i.registration_option_id))];
    const { data: options, error: optionsError } = await supabase
      .from("registration_options")
      .select("id, label, stripe_price_id, is_open")
      .in("id", optionIds);
    if (optionsError || !options) {
      return json({ error: "Could not load registration options" }, 400);
    }
    const optionById = new Map(options.map((o: any) => [o.id, o]));

    const lineItems = [];
    const registrations = [];
    for (const item of items) {
      const option = optionById.get(item.registration_option_id);
      const athlete = athleteById.get(item.athlete_id);
      if (!option || !athlete) {
        return json({ error: "Invalid item in cart" }, 400);
      }
      if (!option.is_open) {
        return json({ error: `"${option.label}" is not currently open for registration` }, 400);
      }
      lineItems.push({ price: option.stripe_price_id, quantity: 1 });
      registrations.push({
        athlete_id: athlete.id,
        athlete_name: athlete.full_name,
        registration_option_id: option.id,
        registration_label: option.label,
      });
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
      apiVersion: "2024-06-20",
    });

    const siteUrl = Deno.env.get("SITE_URL") ?? "https://eastcountyaquatics.github.io/website";

    // Consent answers from the registration agreement modal. Free-text
    // fields are capped so the whole blob stays well under Stripe's
    // 500-char-per-metadata-value limit.
    const rawConsent = body.consent && typeof body.consent === "object" ? body.consent : {};
    const consent = {
      heard_about: typeof rawConsent.heard_about === "string" ? rawConsent.heard_about.slice(0, 60) : null,
      referral_name: typeof rawConsent.referral_name === "string" ? rawConsent.referral_name.slice(0, 120) : null,
      discount_code: typeof rawConsent.discount_code === "string" ? rawConsent.discount_code.slice(0, 40) : null,
      agreed_at: typeof rawConsent.agreed_at === "string" ? rawConsent.agreed_at.slice(0, 40) : null,
    };

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: lineItems,
      customer_email: user.email,
      success_url: `${siteUrl}/dashboard.html?checkout=success`,
      cancel_url: `${siteUrl}/dashboard.html?checkout=cancelled`,
      metadata: {
        user_id: user.id,
        registrations: JSON.stringify(registrations),
        consent: JSON.stringify(consent),
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

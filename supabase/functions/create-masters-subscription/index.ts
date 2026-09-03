// Starts a recurring Stripe Checkout Session (mode: "subscription") for
// the signed-in member's own Masters membership -- unlike team
// registration, there's no athlete record here; the account holder is
// the player. Runs with the caller's own JWT so we know exactly who's
// subscribing.
//
// Deploy: supabase functions deploy create-masters-subscription
// Secrets required: STRIPE_SECRET_KEY, SITE_URL, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

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
    if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

    const callerClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: userData, error: userError } = await callerClient.auth.getUser();
    if (userError || !userData.user) return json({ error: "Not signed in" }, 401);
    const user = userData.user;

    const body = await req.json();
    const tier = String(body.tier || "");
    if (tier !== "25_under" && tier !== "26_plus") {
      return json({ error: "tier must be '25_under' or '26_plus'" }, 400);
    }

    // Service role: reading the price tier is public anyway, but writing
    // masters_subscriptions has no client insert policy at all -- only
    // this function and the webhook may create/update those rows.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: existing } = await supabase
      .from("masters_subscriptions")
      .select("id, status")
      .eq("user_id", user.id)
      .in("status", ["pending", "active", "paused", "past_due"])
      .maybeSingle();
    if (existing) {
      return json({ error: "You already have a Masters membership. Manage it below instead of starting a new one." }, 409);
    }

    const { data: priceTier } = await supabase
      .from("masters_price_tiers")
      .select("stripe_price_id, label")
      .eq("tier", tier)
      .maybeSingle();
    if (!priceTier?.stripe_price_id) {
      return json({ error: "Masters pricing hasn't been set up yet. Please contact the club." }, 422);
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
      apiVersion: "2024-06-20",
    });

    const siteUrl = Deno.env.get("SITE_URL") ?? "https://eastcountyaquatics.github.io/website";

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceTier.stripe_price_id, quantity: 1 }],
      customer_email: user.email,
      success_url: `${siteUrl}/dashboard.html?masters=success`,
      cancel_url: `${siteUrl}/dashboard.html?masters=cancelled`,
      subscription_data: {
        metadata: { user_id: user.id, masters_tier: tier },
      },
      metadata: { user_id: user.id, masters_tier: tier },
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

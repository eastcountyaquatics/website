// Starts a recurring Stripe Checkout Session (mode: "subscription") for
// one adult athlete's Masters membership on the signed-in account. Runs
// with the caller's own JWT so we know exactly who's subscribing.
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
    const athleteId = String(body.athlete_id || "");
    if (!athleteId) return json({ error: "Choose which athlete is joining Masters." }, 400);

    // Service role: reading the price tier is public anyway, but writing
    // masters_subscriptions has no client insert policy at all -- only
    // this function and the webhook may create/update those rows.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Masters is per athlete: an adult (19+ as of the club's Aug 1 cutoff)
    // on this account. The monthly tier comes from the player's age today
    // -- 25 & Under or 26+ -- never from the browser.
    const { data: athlete } = await supabase
      .from("athletes")
      .select("id, full_name, birthdate, is_self, parent_id")
      .eq("id", athleteId)
      .maybeSingle();
    if (!athlete || athlete.parent_id !== user.id) return json({ error: "Athlete not found." }, 404);
    if (!athlete.birthdate) return json({ error: `Add a birthdate for ${athlete.full_name} first.` }, 400);
    if (cutoffAge(athlete.birthdate) <= 18) {
      return json({ error: `${athlete.full_name} is in a youth age group -- Masters is for players 19 and over.` }, 400);
    }
    const tier = ageToday(athlete.birthdate) <= 25 ? "25_under" : "26_plus";

    const { data: existing } = await supabase
      .from("masters_subscriptions")
      .select("id")
      .eq("athlete_id", athlete.id)
      .in("status", ["pending", "active", "paused", "past_due"])
      .limit(1)
      .maybeSingle();
    if (existing) {
      return json({ error: `${athlete.full_name} already has a Masters membership. Manage it below instead of starting a new one.` }, 409);
    }

    // Coaches (any staff role) registering THEMSELVES ("this athlete is
    // me") get Masters free: a comped membership with no Stripe behind it.
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (profile?.role && athlete.is_self) {
      const { error: compError } = await supabase.from("masters_subscriptions").insert({
        user_id: user.id,
        athlete_id: athlete.id,
        tier,
        status: "active",
        comped: true,
      });
      if (compError) return json({ error: "Could not start your free coach membership: " + compError.message }, 500);
      const site = Deno.env.get("SITE_URL") ?? "https://eastcountyaquatics.github.io/website";
      return json({ url: `${site}/dashboard.html?masters=success` });
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
      // Card and bank account (ACH) only -- the club turned off the other
      // wallets/pay-later options. Bank payments clear in a few business days;
      // stripe-webhook waits for checkout.session.async_payment_succeeded.
      payment_method_types: ["card", "us_bank_account"],
      line_items: [{ price: priceTier.stripe_price_id, quantity: 1 }],
      customer_email: user.email,
      success_url: `${siteUrl}/dashboard.html?masters=success`,
      cancel_url: `${siteUrl}/dashboard.html?masters=cancelled`,
      subscription_data: {
        metadata: { user_id: user.id, masters_tier: tier, athlete_id: athlete.id },
      },
      metadata: { user_id: user.id, masters_tier: tier, athlete_id: athlete.id },
    });

    return json({ url: session.url });
  } catch (err) {
    console.error(err);
    return json({ error: "Something went wrong creating checkout" }, 500);
  }
});

// Age on Aug 1 of the year after the season starts (js/team-age.js) --
// 19+ is a Masters player.
function cutoffAge(birthdate: string): number {
  const now = new Date();
  const seasonYear = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  const [y, m, d] = birthdate.split("-").map(Number);
  let age = seasonYear + 1 - y;
  if (m > 8 || (m === 8 && d > 1)) age--;
  return age;
}

function ageToday(birthdate: string): number {
  const now = new Date();
  const [y, m, d] = birthdate.split("-").map(Number);
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age--;
  return age;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

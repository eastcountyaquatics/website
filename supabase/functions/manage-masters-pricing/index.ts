// Owner-only: set the monthly price for each Masters age bracket. Stripe
// Prices are immutable once created, so "changing the price" means
// creating a new Price under one shared Product and archiving the old
// one -- existing subscribers keep billing at whatever Price they signed
// up under; only new subscriptions pick up the new amount.
//
// Deploy: supabase functions deploy manage-masters-pricing
// Secrets required: STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

import Stripe from "npm:stripe@^17";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TIERS = ["25_under", "26_plus"] as const;

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

    const { data: profile } = await callerClient
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .single();
    if (!profile || profile.role !== "owner") {
      return json({ error: "Owner access required" }, 403);
    }

    // Service role from here on -- masters_price_tiers only allows owner
    // writes via RLS anyway, but the Stripe archive-old-price step needs
    // to read the previous stripe_price_id regardless of RLS timing.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();

    if (body.action === "get") {
      const { data } = await supabase.from("masters_price_tiers").select("*").order("tier");
      return json({ tiers: data ?? [] });
    }

    if (body.action === "set") {
      const tier = String(body.tier || "");
      if (!TIERS.includes(tier as (typeof TIERS)[number])) {
        return json({ error: "tier must be '25_under' or '26_plus'" }, 400);
      }
      const label = String(body.label || "").trim().slice(0, 80);
      if (!label) return json({ error: "Label is required" }, 400);
      const dollars = Number(body.amount_dollars);
      if (!(dollars > 0)) return json({ error: "Enter a monthly amount greater than 0" }, 400);
      const amountCents = Math.round(dollars * 100);

      const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
        apiVersion: "2024-06-20",
      });

      const { data: existing } = await supabase
        .from("masters_price_tiers")
        .select("*")
        .eq("tier", tier)
        .maybeSingle();

      let productId = existing?.stripe_product_id;
      if (!productId) {
        const product = await stripe.products.create({
          name: `ECA Masters Membership — ${label}`,
        });
        productId = product.id;
      }

      const price = await stripe.prices.create({
        product: productId,
        unit_amount: amountCents,
        currency: "usd",
        recurring: { interval: "month" },
      });

      if (existing?.stripe_price_id) {
        await stripe.prices.update(existing.stripe_price_id, { active: false });
      }

      const { error } = await supabase.from("masters_price_tiers").upsert(
        {
          tier,
          label,
          amount_cents: amountCents,
          stripe_price_id: price.id,
          stripe_product_id: productId,
        },
        { onConflict: "tier" }
      );
      if (error) return json({ error: error.message }, 500);

      return json({ ok: true, stripe_price_id: price.id });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Something went wrong";
    return json({ error: message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

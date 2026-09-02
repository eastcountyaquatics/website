// Owner-only: create and list Stripe Promotion Codes (the customer-facing
// codes like "ecasibling2") backed by real Stripe Coupons. Kept server-side
// because it needs the Stripe secret key; the browser never sees it.
//
// Deploy: supabase functions deploy manage-coupons
// Secrets required: STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_ANON_KEY

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

    // verify_jwt only proves the caller is signed in, not that they're an
    // owner -- check the role explicitly, same as every other admin-only
    // edge function should.
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .single();
    if (!profile || profile.role !== "owner") {
      return json({ error: "Owner access required" }, 403);
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
      apiVersion: "2024-06-20",
    });

    const body = await req.json();

    if (body.action === "list") {
      const promoCodes = await stripe.promotionCodes.list({
        limit: 100,
        expand: ["data.coupon"],
      });
      const rows = promoCodes.data.map((pc) => {
        const coupon = pc.coupon;
        return {
          id: pc.id,
          code: pc.code,
          active: pc.active,
          times_redeemed: pc.times_redeemed,
          max_redemptions: pc.max_redemptions,
          expires_at: pc.expires_at ? new Date(pc.expires_at * 1000).toISOString() : null,
          percent_off: coupon.percent_off,
          amount_off: coupon.amount_off,
          currency: coupon.currency,
        };
      });
      return json({ codes: rows });
    }

    if (body.action === "create") {
      const code = String(body.code || "").trim().toUpperCase();
      if (!/^[A-Z0-9_-]{3,40}$/.test(code)) {
        return json({ error: "Code must be 3-40 letters/numbers/dashes/underscores" }, 400);
      }

      const couponParams: Stripe.CouponCreateParams = { duration: "once" };
      if (body.discount_type === "percent") {
        const pct = Number(body.value);
        if (!(pct > 0 && pct <= 100)) return json({ error: "Enter a percent between 1 and 100" }, 400);
        couponParams.percent_off = pct;
      } else if (body.discount_type === "amount") {
        const dollars = Number(body.value);
        if (!(dollars > 0)) return json({ error: "Enter a dollar amount greater than 0" }, 400);
        couponParams.amount_off = Math.round(dollars * 100);
        couponParams.currency = "usd";
      } else {
        return json({ error: "discount_type must be 'percent' or 'amount'" }, 400);
      }

      const coupon = await stripe.coupons.create(couponParams);

      const promoParams: Stripe.PromotionCodeCreateParams = {
        coupon: coupon.id,
        code,
      };
      if (body.max_redemptions) promoParams.max_redemptions = Number(body.max_redemptions);
      if (body.expires_at) promoParams.expires_at = Math.floor(new Date(body.expires_at).getTime() / 1000);

      const promotionCode = await stripe.promotionCodes.create(promoParams);
      return json({ id: promotionCode.id, code: promotionCode.code });
    }

    if (body.action === "deactivate") {
      if (!body.id) return json({ error: "Missing id" }, 400);
      await stripe.promotionCodes.update(body.id, { active: false });
      return json({ ok: true });
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

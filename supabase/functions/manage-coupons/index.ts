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
          scope_type: coupon.metadata?.scope_type || null,
          scope_id: coupon.metadata?.scope_id || null,
          scope_label: coupon.metadata?.scope_label || null,
        };
      });
      return json({ codes: rows });
    }

    if (body.action === "create") {
      const code = String(body.code || "").trim().toUpperCase();
      if (!/^[A-Z0-9_-]{3,40}$/.test(code)) {
        return json({ error: "Code must be 3-40 letters/numbers/dashes/underscores" }, 400);
      }

      // Every code must be scoped to exactly one tournament or registration
      // option ("team session") -- there is no unrestricted/global code
      // through this workflow. Stripe has no native concept of "this
      // tournament", so the scope lives in the coupon's own metadata and
      // checkout (create-checkout-session / create-tournament-checkout)
      // checks it against what's actually being purchased before applying
      // the discount.
      const scopeType = String(body.scope_type || "");
      const scopeId = String(body.scope_id || "").trim();
      if (scopeType !== "tournament" && scopeType !== "registration_option") {
        return json({ error: "Choose whether this code applies to a tournament or a team registration session" }, 400);
      }
      if (!scopeId) {
        return json({ error: "Choose which tournament or session this code applies to" }, 400);
      }
      const scopeTable = scopeType === "tournament" ? "tournaments" : "registration_options";
      const scopeLabelCol = scopeType === "tournament" ? "name" : "label";
      const { data: scopeRow } = await supabase.from(scopeTable).select(scopeLabelCol).eq("id", scopeId).maybeSingle();
      if (!scopeRow) return json({ error: "That tournament or session could not be found" }, 400);
      const scopeLabel = String((scopeRow as Record<string, unknown>)[scopeLabelCol] || "");

      const couponParams: Stripe.CouponCreateParams = {
        duration: "once",
        metadata: { scope_type: scopeType, scope_id: scopeId, scope_label: scopeLabel },
      };
      if (body.discount_type === "percent") {
        const pct = Number(body.value);
        if (!(pct > 0 && pct <= 100)) return json({ error: "Enter a percent between 1 and 100" }, 400);
        couponParams.percent_off = pct;
      } else if (body.discount_type === "amount" || !body.discount_type) {
        // Dollar Amount is the default discount type -- percent is still
        // available, just not selected unless the admin picks it.
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
      // Max Uses defaults to 1 (the admin can raise it) rather than Stripe's
      // own default of unlimited.
      promoParams.max_redemptions = body.max_redemptions ? Number(body.max_redemptions) : 1;
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

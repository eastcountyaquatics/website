// Owner-only CRUD for registration options. Stripe Prices are immutable
// once created, so "changing the price" means creating a new Price under
// one shared Product and archiving the old one -- past purchases stay
// tied to whatever Price they were actually charged under; only new
// checkouts pick up the new amount. Nobody has to visit the Stripe
// dashboard or paste a Price ID by hand -- the admin form just posts a
// label + dollar amount here.
//
// Deploy: supabase functions deploy manage-registration-options
// Secrets required: STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

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

    const { data: profile } = await callerClient
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .single();
    if (!profile || profile.role !== "owner") {
      return json({ error: "Owner access required" }, 403);
    }

    // Service role from here on -- registration_options only allows owner
    // writes via RLS anyway, but the Stripe archive-old-price step needs
    // to read the previous stripe_price_id/stripe_product_id regardless
    // of RLS timing.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();

    if (body.action === "set") {
      const label = String(body.label || "").trim().slice(0, 120);
      if (!label) return json({ error: "Label is required" }, 400);
      const dollars = Number(body.amount_dollars);
      if (!Number.isFinite(dollars) || dollars < 0) {
        return json({ error: "Enter a valid amount" }, 400);
      }
      const amountCents = Math.round(dollars * 100);

      const description = String(body.description || "").trim().slice(0, 500) || null;
      // team_slugs is a tag array (one option can apply to several teams,
      // or to none) -- see the big-batch migration that widened this from
      // a single team_slug. Anything else sent for this field is ignored
      // rather than trusted.
      const teamSlugs: string[] = Array.isArray(body.team_slugs)
        ? body.team_slugs.map((s: unknown) => String(s).trim()).filter(Boolean)
        : [];
      const season = String(body.season || "").trim().slice(0, 80) || null;
      const sortOrder = Number.isFinite(Number(body.sort_order)) ? Math.trunc(Number(body.sort_order)) : 0;
      const isOpen = body.is_open !== false;

      const id = body.id ? String(body.id) : null;
      let existing: { amount_cents: number; label: string; stripe_price_id: string | null; stripe_product_id: string | null } | null = null;
      if (id) {
        const { data } = await supabase
          .from("registration_options")
          .select("amount_cents, label, stripe_price_id, stripe_product_id")
          .eq("id", id)
          .maybeSingle();
        if (!data) return json({ error: "Registration option not found" }, 404);
        existing = data;
      }

      const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
        apiVersion: "2024-06-20",
      });

      let productId = existing?.stripe_product_id ?? null;
      if (!productId) {
        const product = await stripe.products.create({ name: label });
        productId = product.id;
      } else if (existing && existing.label !== label) {
        await stripe.products.update(productId, { name: label });
      }

      let priceId = existing?.stripe_price_id ?? null;
      const amountChanged = !existing || existing.amount_cents !== amountCents;
      if (amountChanged || !priceId) {
        const price = await stripe.prices.create({
          product: productId,
          unit_amount: amountCents,
          currency: "usd",
        });
        if (priceId) {
          await stripe.prices.update(priceId, { active: false });
        }
        priceId = price.id;
      }

      const row = {
        team_slugs: teamSlugs,
        season,
        label,
        description,
        amount_cents: amountCents,
        stripe_price_id: priceId,
        stripe_product_id: productId,
        sort_order: sortOrder,
        is_open: isOpen,
      };

      const result = id
        ? await supabase.from("registration_options").update(row).eq("id", id).select().single()
        : await supabase.from("registration_options").insert(row).select().single();
      if (result.error) return json({ error: result.error.message }, 500);

      return json({ ok: true, option: result.data });
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

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
      .select("id, full_name, birthdate, sex, team_slug")
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
      .select("id, label, stripe_price_id, is_open, team_slugs")
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
      if (!athleteFitsProgram(athlete, option.team_slugs || [])) {
        return json({ error: `${athlete.full_name} isn't in the age group for "${option.label}".` }, 400);
      }
      const reg = {
        athlete_id: athlete.id,
        athlete_name: athlete.full_name,
        registration_option_id: option.id,
        registration_label: option.label,
      };
      lineItems.push({ price: option.stripe_price_id, quantity: 1 });
      registrations.push(reg);
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

    // A real Stripe Promotion Code, looked up by the code the family typed
    // in the registration agreement modal. An unrecognized code is a hard
    // error rather than silently charging full price -- a family who
    // thinks they got a discount should never be charged as if they didn't.
    let discounts: Stripe.Checkout.SessionCreateParams.Discount[] | undefined;
    if (consent.discount_code) {
      const promoCodes = await stripe.promotionCodes.list({
        code: consent.discount_code.toUpperCase(),
        active: true,
        limit: 1,
        expand: ["data.coupon"],
      });
      if (promoCodes.data.length === 0) {
        return json({ error: `Discount code "${consent.discount_code}" was not recognized or has expired. Remove it or double-check it to continue.` }, 400);
      }
      const promo = promoCodes.data[0];
      // A code is scoped to one registration option, to every session
      // ("all_sessions", e.g. a sibling discount), or to every session and
      // tournament ("all", e.g. coaches' kids). Checked here, server-side,
      // rather than trusting whatever the client sent.
      const scopeType = promo.coupon.metadata?.scope_type;
      const scopeId = promo.coupon.metadata?.scope_id;
      const appliesHere = scopeType === "all" || scopeType === "all_sessions" ||
        (scopeType === "registration_option" && !!scopeId &&
          registrations.some((r) => r.registration_option_id === scopeId));
      if (!appliesHere) {
        return json({ error: `Discount code "${consent.discount_code}" doesn't apply to this registration.` }, 400);
      }
      discounts = [{ promotion_code: promo.id }];
    }

    // Stripe caps a metadata value at 500 characters -- fine for one athlete,
    // but the full registrations array (names + labels) blows past that with
    // just two or three in the same checkout, which would make
    // sessions.create() below fail outright for exactly the multi-sibling
    // checkout the site is meant to support. Store the cart server-side and
    // pass only its id; the webhook reads it back with the service role.
    const { data: cart, error: cartError } = await supabase
      .from("registration_carts")
      .insert({ user_id: user.id, items: registrations, consent })
      .select("id")
      .single();
    if (cartError || !cart) {
      console.error("Could not create registration cart", cartError);
      return json({ error: "Could not start checkout. Please try again." }, 500);
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      // Card and bank account (ACH) only -- the club turned off the other
      // wallets/pay-later options. Bank payments clear in a few business days;
      // stripe-webhook waits for checkout.session.async_payment_succeeded.
      payment_method_types: ["card", "us_bank_account"],
      line_items: lineItems,
      customer_email: user.email,
      success_url: `${siteUrl}/dashboard.html?checkout=success`,
      cancel_url: `${siteUrl}/dashboard.html?checkout=cancelled`,
      ...(discounts ? { discounts } : {}),
      metadata: {
        user_id: user.id,
        cart_id: cart.id,
      },
    });

    return json({ url: session.url });
  } catch (err) {
    console.error(err);
    return json({ error: "Something went wrong creating checkout" }, 500);
  }
});

// Same rule as dashboard.html's athleteFitsProgram / js/team-age.js: age
// group by age on Aug 1 of the year after the season starts; a staff-set
// team overrides it; Splashball is 8 & under; 19+ only fits "masters".
function athleteFitsProgram(
  a: { birthdate: string | null; sex: string | null; team_slug: string | null },
  optionTeams: string[],
): boolean {
  if (!optionTeams.length || !a.birthdate) return false;
  const now = new Date();
  const seasonYear = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  const [y, m, d] = a.birthdate.split("-").map(Number);
  let age = seasonYear + 1 - y;
  if (m > 8 || (m === 8 && d > 1)) age--;
  if (age > 18) return optionTeams.includes("masters");
  if (optionTeams.includes("splashball") && age <= 8) return true;
  if (a.team_slug) return optionTeams.includes(a.team_slug);
  const bracket = age <= 8 ? "8u" : age <= 10 ? "10u" : age <= 12 ? "12u" : age <= 14 ? "14u" : age <= 16 ? "16u" : "18u";
  if (bracket === "8u" || bracket === "10u") return optionTeams.includes(bracket + "-coed");
  const sex = (a.sex || "").toLowerCase();
  const slug = sex === "male" ? bracket + "-boys" : sex === "female" ? bracket + "-girls" : null;
  return !!slug && optionTeams.includes(slug);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

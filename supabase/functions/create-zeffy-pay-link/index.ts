// Public, no login required: the Zeffy version of create-tournament-checkout.
// For a tournament set to pay on Zeffy, works out the family's price exactly
// as the Stripe checkout would (age/gender tier, then the club's discount
// codes -- the same Stripe promotion codes Admin > Coupons manages) and
// returns a payment code plus the link to the club's generic Zeffy form.
// The family pays that amount there and pastes the code; zeffy-webhook
// reads the code back and marks the invite paid (or emails the balance).
//
// One code per invite: asking again re-prices it (e.g. a discount code was
// added) until money has come in against it.
//
// Deploy: supabase functions deploy create-zeffy-pay-link --no-verify-jwt
// Secrets required: STRIPE_SECRET_KEY (discount codes only), SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY

import Stripe from "npm:stripe@^17";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// No 0/O, 1/I/L: codes get read off a screen and typed.
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const token = String(body.token || "").trim();
    const payerName = String(body.payer_name || "").trim().slice(0, 120);
    const payerEmail = String(body.payer_email || "").trim().slice(0, 200);
    const shirtSize = typeof body.shirt_size === "string" ? body.shirt_size.trim().slice(0, 20) : null;
    const discountCode = typeof body.discount_code === "string" ? body.discount_code.trim().slice(0, 40) : "";

    if (!token) return json({ error: "Missing token" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const resolved = await resolveInvite(supabase, token);
    if ("error" in resolved) return json({ error: resolved.error }, resolved.status);
    const { invite, tournament, athlete, tier } = resolved;

    if (tournament.payment_provider !== "zeffy") {
      return json({ error: "This tournament is paid by card on the invite page." }, 409);
    }

    const { data: existing } = await supabase
      .from("zeffy_pay_links")
      .select("code, amount_due_cents, paid_cents, status")
      .eq("tournament_invite_id", invite.id)
      .maybeSingle();

    if (invite.status === "paid" || existing?.status === "paid") {
      return json({ error: "This invite has already been paid." }, 409);
    }

    const closed = paymentClosedReason(tournament);
    if (closed) return json({ error: closed }, 409);

    const { data: formSetting } = await supabase
      .from("site_settings")
      .select("value")
      .eq("key", "zeffy_paylink_form")
      .maybeSingle();
    const formUrl = (formSetting?.value as { url?: string } | null)?.url;
    if (!formUrl || !/^https:\/\/(www\.)?zeffy\.com\//.test(formUrl)) {
      return json({ error: "Online payment for this tournament isn't set up yet. Please contact the club." }, 503);
    }

    // Money already came in against this code (a short payment): keep the
    // price it was quoted at and just show the balance.
    if (existing && existing.status === "short") {
      return json(payLinkResponse(existing.code, existing.amount_due_cents, existing.paid_cents, "short", formUrl, tier.label));
    }

    if (!payerEmail || !payerEmail.includes("@")) return json({ error: "Enter a valid email address" }, 400);

    let amount = tier.amount_cents;
    let appliedCode: string | null = null;
    if (discountCode) {
      const discounted = await applyDiscount(supabase, discountCode, tournament.id, amount, invite.id);
      if ("error" in discounted) return json({ error: discounted.error }, 400);
      amount = discounted.amount;
      appliedCode = discounted.code;
    }

    const fields = {
      amount_due_cents: amount,
      tier_label: tier.label,
      discount_code: appliedCode,
      payer_name: payerName || null,
      payer_email: payerEmail,
      shirt_size: shirtSize,
      updated_at: new Date().toISOString(),
    };

    let code = existing?.code;
    if (code) {
      const { error } = await supabase.from("zeffy_pay_links").update(fields).eq("code", code);
      if (error) throw error;
    } else {
      for (let attempt = 0; attempt < 5 && !code; attempt++) {
        const candidate = newCode();
        const { error } = await supabase.from("zeffy_pay_links").insert({ code: candidate, tournament_invite_id: invite.id, ...fields });
        if (!error) code = candidate;
        else if (error.code !== "23505") throw error;
        // 23505 on tournament_invite_id: a double click created it first.
        else {
          const { data: raced } = await supabase.from("zeffy_pay_links").select("code").eq("tournament_invite_id", invite.id).maybeSingle();
          if (raced) {
            await supabase.from("zeffy_pay_links").update(fields).eq("code", raced.code);
            code = raced.code;
          }
        }
      }
      if (!code) throw new Error("Could not create a payment code");
    }

    // Free after the discount: nothing to pay on Zeffy -- register now.
    if (amount === 0) {
      await supabase.from("purchases").insert({
        user_id: null, athlete_id: athlete.id, tournament_id: tournament.id, tournament_invite_id: invite.id,
        description: `${tournament.name} — ${athlete.full_name} (${tier.label}, code ${appliedCode})`,
        amount_cents: 0, currency: "usd", status: "paid", program_kind: "tournament",
        payer_name: payerName || null, payer_email: payerEmail,
      });
      await supabase.from("zeffy_pay_links").update({ status: "paid" }).eq("code", code);
      await supabase.from("tournament_invites").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", invite.id);
      return json({ ...payLinkResponse(code, 0, 0, "paid", formUrl, tier.label), free: true });
    }

    return json(payLinkResponse(code, amount, 0, "open", formUrl, tier.label));
  } catch (err) {
    console.error(err);
    return json({ error: "Something went wrong getting your payment code" }, 500);
  }
});

function payLinkResponse(code: string, due: number, paid: number, status: string, formUrl: string, tierLabel: string) {
  return {
    code,
    amount_due_cents: due,
    paid_cents: paid,
    balance_cents: Math.max(0, due - paid),
    status,
    form_url: formUrl,
    tier_label: tierLabel,
  };
}

// ECA- + 5 random characters + 1 check character, so a mistyped code is
// rejected instead of landing on someone else's invite.
function newCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(5));
  const chars = Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]);
  return "ECA-" + chars.join("") + checkChar(chars.join(""));
}

// NOTE: duplicated in zeffy-webhook. Keep them in sync.
function checkChar(body: string): string {
  let sum = 0;
  for (let i = 0; i < body.length; i++) sum += (i + 1) * CODE_ALPHABET.indexOf(body[i]);
  return CODE_ALPHABET[sum % CODE_ALPHABET.length];
}

// Same rules as create-tournament-checkout: a code works for this
// tournament or for everything. Stripe only counts redemptions made in
// Stripe Checkout, so uses on Zeffy are counted from paid pay links.
async function applyDiscount(
  supabase: ReturnType<typeof createClient>,
  discountCode: string,
  tournamentId: string,
  amount: number,
  inviteId: string,
): Promise<{ amount: number; code: string } | { error: string }> {
  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20" });
  const promoCodes = await stripe.promotionCodes.list({
    code: discountCode.toUpperCase(),
    active: true,
    limit: 1,
    expand: ["data.coupon"],
  });
  const promo = promoCodes.data[0];
  if (!promo || !promo.coupon.valid) {
    return { error: `Discount code "${discountCode}" was not recognized or has expired.` };
  }
  const appliesHere = promo.coupon.metadata?.scope_type === "all" ||
    (promo.coupon.metadata?.scope_type === "tournament" && promo.coupon.metadata?.scope_id === tournamentId);
  if (!appliesHere) {
    return { error: `Discount code "${discountCode}" doesn't apply to this tournament.` };
  }
  const limit = promo.max_redemptions ?? promo.coupon.max_redemptions;
  if (limit != null) {
    const { count } = await supabase
      .from("zeffy_pay_links")
      .select("code", { count: "exact", head: true })
      .eq("discount_code", promo.code)
      .eq("status", "paid")
      .neq("tournament_invite_id", inviteId);
    if ((promo.times_redeemed ?? 0) + (count ?? 0) >= limit) {
      return { error: `Discount code "${discountCode}" has been used up.` };
    }
  }
  let off = 0;
  if (promo.coupon.percent_off) off = Math.round(amount * promo.coupon.percent_off / 100);
  else if (promo.coupon.amount_off && (promo.coupon.currency ?? "usd") === "usd") off = promo.coupon.amount_off;
  return { amount: Math.max(0, amount - off), code: promo.code };
}

// NOTE: duplicated from get-tournament-invite / create-tournament-checkout --
// each Edge Function deploys as an independent bundle with no shared module
// between them, so the price quoted and the price asked for are computed by
// copies of the same code. Keep them in sync.
async function resolveInvite(supabase: ReturnType<typeof createClient>, token: string) {
  const { data: invite, error: inviteError } = await supabase
    .from("tournament_invites")
    .select("id, tournament_id, athlete_id, token, status")
    .eq("token", token)
    .maybeSingle();
  if (inviteError || !invite) return { error: "This invite link is not valid.", status: 404 } as const;

  const { data: tournament, error: tournamentError } = await supabase
    .from("tournaments")
    .select("id, name, description, event_date, requirements, shirt_size_enabled, is_published, rsvp_deadline, payment_provider")
    .eq("id", invite.tournament_id)
    .maybeSingle();
  if (tournamentError || !tournament) return { error: "This tournament could not be found.", status: 404 } as const;

  const { data: athlete, error: athleteError } = await supabase
    .from("athletes")
    .select("id, full_name, birthdate, sex")
    .eq("id", invite.athlete_id)
    .maybeSingle();
  if (athleteError || !athlete) return { error: "This athlete could not be found.", status: 404 } as const;

  if (!athlete.birthdate) {
    return { error: "This athlete's birthdate isn't on file, so we can't determine their price. Please contact the club.", status: 422 } as const;
  }

  const { data: tiers, error: tiersError } = await supabase
    .from("tournament_price_tiers")
    .select("id, label, min_age, max_age, gender, amount_cents, sort_order")
    .eq("tournament_id", invite.tournament_id)
    .order("sort_order", { ascending: true });
  if (tiersError || !tiers || tiers.length === 0) {
    return { error: "No pricing has been set up for this tournament yet. Please contact the club.", status: 422 } as const;
  }

  const age = calcAgeAsOf(athlete.birthdate, tournament.event_date);
  const tier = tiers.find((t) => {
    const ageOk = (t.min_age == null || age >= t.min_age) && (t.max_age == null || age <= t.max_age);
    const genderOk = !t.gender || t.gender === athlete.sex;
    return ageOk && genderOk;
  });
  if (!tier) {
    return { error: "No pricing tier matches this athlete's age/gender for this tournament. Please contact the club.", status: 422 } as const;
  }

  return { invite, tournament, athlete, tier } as const;
}

// NOTE: duplicated in the other tournament functions. Keep them in sync.
function paymentClosedReason(tournament: {
  is_published?: boolean | null;
  rsvp_deadline?: string | null;
  event_date?: string | null;
}): string | null {
  if (!tournament.is_published) {
    return "This tournament isn't open for payment yet. Please contact the club.";
  }
  const today = clubToday();
  if (tournament.rsvp_deadline && today > tournament.rsvp_deadline) {
    return "The payment cutoff for this tournament has passed. Please contact the club — a spot may still be available, and a late fee may apply.";
  }
  if (tournament.event_date && today > tournament.event_date) {
    return "This tournament has already taken place.";
  }
  return null;
}

function clubToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
}

function calcAgeAsOf(birthdate: string, asOfDate: string): number {
  const dob = new Date(birthdate + "T00:00:00");
  const cutoff = new Date(asOfDate + "T00:00:00");
  let age = cutoff.getFullYear() - dob.getFullYear();
  const hadBirthday =
    cutoff.getMonth() > dob.getMonth() ||
    (cutoff.getMonth() === dob.getMonth() && cutoff.getDate() >= dob.getDate());
  if (!hadBirthday) age--;
  return age;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

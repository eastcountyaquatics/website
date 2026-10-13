// The Zeffy version of create-checkout-session. A signed-in family picks a
// session (registration option) and kids on My Account and agrees to the
// consent, exactly as for card checkout; this gives each kid their own
// payment code and the link to that session's Zeffy form. On Zeffy the
// family picks the set-price ticket for each kid and pastes that kid's code
// on it; zeffy-webhook reads the code back, so every payment lands on the
// right kid and account -- the code is one-to-one with (athlete, session).
//
// Runs with the caller's own JWT to check who they are and that the kids
// are theirs; codes are written with the service role.
//
// Deploy: supabase functions deploy create-zeffy-registration
// Secrets required: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

    const asUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: userData, error: userError } = await asUser.auth.getUser();
    if (userError || !userData.user) return json({ error: "Not signed in" }, 401);
    const user = userData.user;

    const body = await req.json();
    const items = Array.isArray(body.items) ? body.items : [];
    if (items.length === 0) return json({ error: "No items provided" }, 400);
    if (items.length > 10) return json({ error: "Too many items in one checkout" }, 400);

    // One session per checkout: they all pay on that session's one form.
    const optionIds = [...new Set(items.map((i: any) => i.registration_option_id))];
    if (optionIds.length !== 1) {
      return json({ error: "Register for one session at a time." }, 400);
    }

    // The kids must be this family's (RLS enforces it; checked for a clean error).
    const athleteIds = [...new Set(items.map((i: any) => i.athlete_id))];
    const { data: athletes } = await asUser
      .from("athletes")
      .select("id, full_name, birthdate, sex, team_slug")
      .in("id", athleteIds);
    if (!athletes || athletes.length !== athleteIds.length) {
      return json({ error: "One or more athletes could not be verified" }, 400);
    }

    const { data: option } = await asUser
      .from("registration_options")
      .select("id, label, amount_cents, is_open, team_slugs, payment_provider, zeffy_form_url")
      .eq("id", optionIds[0])
      .maybeSingle();
    if (!option) return json({ error: "Could not load that registration option" }, 400);
    if (!option.is_open) return json({ error: `"${option.label}" is not currently open for registration` }, 400);
    if (option.payment_provider !== "zeffy" || !isZeffyUrl(option.zeffy_form_url)) {
      return json({ error: `"${option.label}" is paid by card.` }, 409);
    }
    for (const a of athletes) {
      if (!athleteFitsProgram(a, option.team_slugs || [])) {
        return json({ error: `${a.full_name} isn't in the age group for "${option.label}".` }, 400);
      }
    }

    // Consent from the registration agreement. Discount codes aren't taken
    // here: with set prices they're entered on Zeffy.
    const rawConsent = body.consent && typeof body.consent === "object" ? body.consent : {};
    const consent = {
      heard_about: typeof rawConsent.heard_about === "string" ? rawConsent.heard_about.slice(0, 60) : null,
      referral_name: typeof rawConsent.referral_name === "string" ? rawConsent.referral_name.slice(0, 120) : null,
      discount_code: null,
      agreed_at: typeof rawConsent.agreed_at === "string" ? rawConsent.agreed_at.slice(0, 40) : null,
    };

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const codes = [];
    for (const a of athletes) {
      // Already registered for this session (card or Zeffy): don't charge twice.
      const { data: already } = await admin
        .from("purchases")
        .select("id")
        .eq("athlete_id", a.id)
        .eq("registration_option_id", option.id)
        .eq("status", "paid")
        .limit(1)
        .maybeSingle();
      if (already) return json({ error: `${a.full_name} is already registered for "${option.label}".` }, 409);

      const { data: existing } = await admin
        .from("zeffy_registration_codes")
        .select("code, amount_due_cents, paid_cents, status")
        .eq("athlete_id", a.id)
        .eq("registration_option_id", option.id)
        .maybeSingle();

      let code = existing?.code as string | undefined;
      let due = existing?.amount_due_cents ?? option.amount_cents;
      const paid = existing?.paid_cents ?? 0;
      if (existing?.status === "paid") {
        return json({ error: `${a.full_name} is already registered for "${option.label}".` }, 409);
      }
      if (code) {
        // Same code every time. Re-agreeing refreshes the consent; the price
        // follows the option until money has come in against it.
        const fields: Record<string, unknown> = { consent, user_id: user.id, updated_at: new Date().toISOString() };
        if (paid === 0) {
          fields.amount_due_cents = option.amount_cents;
          fields.option_label = option.label;
          due = option.amount_cents;
        }
        const { error } = await admin.from("zeffy_registration_codes").update(fields).eq("code", code);
        if (error) throw error;
      } else {
        for (let attempt = 0; attempt < 5 && !code; attempt++) {
          const candidate = newCode();
          // Codes are shared with tournament pay links: never reuse one.
          const { data: taken } = await admin.from("zeffy_pay_links").select("code").eq("code", candidate).maybeSingle();
          if (taken) continue;
          const { error } = await admin.from("zeffy_registration_codes").insert({
            code: candidate, athlete_id: a.id, registration_option_id: option.id, user_id: user.id,
            option_label: option.label, amount_due_cents: option.amount_cents, consent,
          });
          if (!error) code = candidate;
          else if (error.code !== "23505") throw error;
          else {
            // A double click created it first: use that one.
            const { data: raced } = await admin.from("zeffy_registration_codes").select("code")
              .eq("athlete_id", a.id).eq("registration_option_id", option.id).maybeSingle();
            if (raced) code = raced.code;
          }
        }
        if (!code) throw new Error("Could not create a payment code");
        due = option.amount_cents;
      }
      codes.push({
        athlete_id: a.id,
        athlete_name: a.full_name,
        code,
        amount_due_cents: due,
        paid_cents: paid,
        balance_cents: Math.max(0, due - paid),
        status: paid > 0 ? "short" : "open",
      });
    }

    return json({
      form_url: option.zeffy_form_url,
      option_label: option.label,
      amount_cents: option.amount_cents,
      codes,
    });
  } catch (err) {
    console.error(err);
    return json({ error: "Something went wrong getting your payment codes" }, 500);
  }
});

function isZeffyUrl(u: unknown): u is string {
  return typeof u === "string" && /^https:\/\/(www\.)?zeffy\.com\//.test(u);
}

// ECA- + 5 random characters + 1 check character, so a mistyped code is
// rejected instead of landing on someone else's kid.
function newCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(5));
  const chars = Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]);
  return "ECA-" + chars.join("") + checkChar(chars.join(""));
}

// NOTE: duplicated in zeffy-webhook and create-zeffy-pay-link. Keep them in sync.
function checkChar(body: string): string {
  let sum = 0;
  for (let i = 0; i < body.length; i++) sum += (i + 1) * CODE_ALPHABET.indexOf(body[i]);
  return CODE_ALPHABET[sum % CODE_ALPHABET.length];
}

// NOTE: duplicated from create-checkout-session. Same rule as
// dashboard.html's athleteFitsProgram / js/team-age.js: age group by age on
// Aug 1 of the year after the season starts; a staff-set team overrides it;
// Splashball is 8 & under; 19+ only fits "masters".
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

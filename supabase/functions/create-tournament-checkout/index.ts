// Public, no login required: creates a Stripe Checkout Session for one
// tournament invite. Re-validates the token and re-computes the price
// tier server-side rather than trusting anything the browser sends, then
// builds the Stripe line item with price_data (a price computed on the
// fly) rather than a pre-created Stripe Price, since the amount depends
// on the specific athlete's age/gender at invite time.
//
// Deploy: supabase functions deploy create-tournament-checkout --no-verify-jwt
// Secrets required: STRIPE_SECRET_KEY, SITE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

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
    const body = await req.json();
    const token = String(body.token || "").trim();
    const payerName = String(body.payer_name || "").trim().slice(0, 120);
    const payerEmail = String(body.payer_email || "").trim().slice(0, 200);
    const shirtSize = typeof body.shirt_size === "string" ? body.shirt_size.trim().slice(0, 20) : null;

    if (!token) return json({ error: "Missing token" }, 400);
    if (!payerEmail || !payerEmail.includes("@")) return json({ error: "Enter a valid email address" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const resolved = await resolveInvite(supabase, token);
    if ("error" in resolved) return json({ error: resolved.error }, resolved.status);
    const { invite, tournament, athlete, tier } = resolved;

    if (invite.status === "paid") {
      return json({ error: "This invite has already been paid." }, 409);
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
      apiVersion: "2024-06-20",
    });

    const siteUrl = Deno.env.get("SITE_URL") ?? "https://eastcountyaquatics.github.io/website";
    const returnUrl = `${siteUrl}/tournament-invite.html?token=${encodeURIComponent(token)}`;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: tier.amount_cents,
            product_data: {
              name: `${tournament.name} — ${athlete.full_name}`,
              description: tier.label,
            },
          },
          quantity: 1,
        },
      ],
      customer_email: payerEmail,
      success_url: `${returnUrl}&checkout=success`,
      cancel_url: `${returnUrl}&checkout=cancelled`,
      metadata: {
        tournament_invite_token: token,
        tournament_id: tournament.id,
        athlete_id: athlete.id,
        tier_label: tier.label,
        payer_name: payerName,
        payer_email: payerEmail,
        shirt_size: shirtSize ?? "",
      },
    });

    return json({ url: session.url });
  } catch (err) {
    console.error(err);
    return json({ error: "Something went wrong creating checkout" }, 500);
  }
});

// NOTE: duplicated from get-tournament-invite -- each Edge Function
// deploys as an independent bundle with no shared module between them
// here, so the price a family is quoted and the price actually charged
// are computed by two copies of the same code. Keep them in sync.
async function resolveInvite(supabase: ReturnType<typeof createClient>, token: string) {
  const { data: invite, error: inviteError } = await supabase
    .from("tournament_invites")
    .select("id, tournament_id, athlete_id, token, status")
    .eq("token", token)
    .maybeSingle();
  if (inviteError || !invite) return { error: "This invite link is not valid.", status: 404 } as const;

  const { data: tournament, error: tournamentError } = await supabase
    .from("tournaments")
    .select("id, name, description, event_date, requirements, shirt_size_enabled")
    .eq("id", invite.tournament_id)
    .maybeSingle();
  if (tournamentError || !tournament) return { error: "This tournament could not be found.", status: 404 } as const;

  const { data: athlete, error: athleteError } = await supabase
    .from("athletes")
    .select("id, full_name, birthdate, gender")
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
    const genderOk = !t.gender || t.gender === athlete.gender;
    return ageOk && genderOk;
  });
  if (!tier) {
    return { error: "No pricing tier matches this athlete's age/gender for this tournament. Please contact the club.", status: 422 } as const;
  }

  return { invite, tournament, athlete, tier } as const;
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

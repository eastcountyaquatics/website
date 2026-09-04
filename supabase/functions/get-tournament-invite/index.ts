// Public, no login required: resolves an invite token into the tournament
// + athlete + the price tier that applies to them, so the invite page can
// show what a family is being asked to pay before they pay it.
//
// Deploy: supabase functions deploy get-tournament-invite --no-verify-jwt
// (invited families have no Supabase account, so there's no JWT to verify;
// the random, unguessable token is what protects this)
//
// Secrets required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

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
    if (!token) return json({ error: "Missing token" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const result = await resolveInvite(supabase, token);
    if ("error" in result) return json({ error: result.error }, result.status);

    return json({
      status: result.invite.status,
      // Non-null when payment is no longer possible, so the page can say why
      // instead of offering a Pay button that the checkout endpoint will
      // reject a click later.
      closed_reason: paymentClosedReason(result.tournament),
      tournament: {
        name: result.tournament.name,
        description: result.tournament.description,
        event_date: result.tournament.event_date,
        rsvp_deadline: result.tournament.rsvp_deadline,
        requirements: result.tournament.requirements,
        shirt_size_enabled: result.tournament.shirt_size_enabled,
      },
      athlete: { full_name: result.athlete.full_name },
      tier: { label: result.tier.label, amount_cents: result.tier.amount_cents },
    });
  } catch (err) {
    console.error(err);
    return json({ error: "Something went wrong" }, 500);
  }
});

// NOTE: this matching logic is duplicated in create-tournament-checkout.
// Each Supabase Edge Function deploys as an independent bundle -- there's
// no shared module between them here -- so the price a family is quoted
// on this page and the price actually charged are computed by two copies
// of the same code rather than one shared function. Keep them in sync.
async function resolveInvite(supabase: ReturnType<typeof createClient>, token: string) {
  const { data: invite, error: inviteError } = await supabase
    .from("tournament_invites")
    .select("id, tournament_id, athlete_id, token, status")
    .eq("token", token)
    .maybeSingle();
  if (inviteError || !invite) return { error: "This invite link is not valid.", status: 404 } as const;

  const { data: tournament, error: tournamentError } = await supabase
    .from("tournaments")
    .select("id, name, description, event_date, requirements, shirt_size_enabled, is_published, rsvp_deadline")
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

  // Age as of the tournament's own event date -- distinct from the Aug-1
  // domestic-eligibility rule used for season team placement.
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

// NOTE: duplicated in the other tournament function -- each Edge Function
// deploys as an independent bundle with no shared module between them.
// Keep them in sync.
//
// The club makes every family agree that "only players who have paid for a
// tournament/game by the payment cutoff date/time will be included on the
// official roster and eligible to play... a late fee may be added if late."
// The cutoff was stored in rsvp_deadline but nothing enforced it, so a
// parent could pay after it and reasonably expect a spot -- leaving the
// club to either refund them or seat them over someone who paid on time.
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

// The club is in El Cajon, CA. A cutoff of "Oct 3" means the end of Oct 3
// Pacific -- comparing against UTC would close payment at 5pm local the
// day before.
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

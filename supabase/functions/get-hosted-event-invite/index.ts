// Public, no login required: resolves a hosted-event invite token into the
// event details + fee, so a visiting team's contact can see what they're
// being asked to pay before they pay it. Mirrors get-tournament-invite, but
// priced per team rather than per athlete, since the "athletes" here are an
// entire outside team with no accounts of their own: one fee per team, or
// (price_by_level) a price for each age group. The club picks which age
// groups -- and how many teams in each -- on hosted-event-signup.html.
//
// Deploy: supabase functions deploy get-hosted-event-invite --no-verify-jwt
// (the invited team has no Supabase account; the random, unguessable token
// is what protects this)
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

    const { data: invite, error: inviteError } = await supabase
      .from("hosted_event_invites")
      .select("id, event_id, team_name, status, registered_teams, amount_cents")
      .eq("token", token)
      .maybeSingle();
    if (inviteError || !invite) return json({ error: "This invite link is not valid." }, 404);

    const { data: event, error: eventError } = await supabase
      .from("hosted_events")
      .select("id, name, event_date, end_date, additional_dates, levels, description, location, fee_cents, price_by_level, level_prices, schedule_url")
      .eq("id", invite.event_id)
      .maybeSingle();
    if (eventError || !event) return json({ error: "This event could not be found." }, 404);

    // Same idea as the tournament payment cutoff: a hosted event that has
    // already happened should not still be taking payment. With multi-day
    // events, "happened" means the LAST day, not just the start date.
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
    const lastDate = [event.event_date, event.end_date].concat(event.additional_dates || []).filter(Boolean).sort().pop();
    const closedReason = lastDate && today > lastDate
      ? "This event has already taken place."
      : null;

    return json({
      status: invite.status,
      closed_reason: closedReason,
      team_name: invite.team_name,
      registered_teams: invite.registered_teams ?? [],
      amount_cents: invite.amount_cents,
      event: {
        name: event.name,
        event_date: event.event_date,
        end_date: event.end_date,
        additional_dates: event.additional_dates,
        levels: event.levels,
        description: event.description,
        location: event.location,
        fee_cents: event.fee_cents,
        price_by_level: event.price_by_level,
        level_prices: event.level_prices ?? [],
        schedule_url: event.schedule_url,
      },
    });
  } catch (err) {
    console.error(err);
    return json({ error: "Something went wrong" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

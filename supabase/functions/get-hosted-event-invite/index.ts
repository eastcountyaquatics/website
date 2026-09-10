// Public, no login required: resolves a hosted-event invite token into the
// event details + fee, so a visiting team's contact can see what they're
// being asked to pay before they pay it. Mirrors get-tournament-invite, but
// simpler -- one fixed fee per team rather than age/gender tiers, since the
// "athletes" here are an entire outside team with no accounts of their own.
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
      .select("id, event_id, team_name, status")
      .eq("token", token)
      .maybeSingle();
    if (inviteError || !invite) return json({ error: "This invite link is not valid." }, 404);

    const { data: event, error: eventError } = await supabase
      .from("hosted_events")
      .select("id, name, event_date, level, description, location, hotel_name, hotel_url, fee_cents")
      .eq("id", invite.event_id)
      .maybeSingle();
    if (eventError || !event) return json({ error: "This event could not be found." }, 404);

    // Same idea as the tournament payment cutoff: a hosted event that has
    // already happened should not still be taking payment.
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
    const closedReason = event.event_date && today > event.event_date
      ? "This event has already taken place."
      : null;

    return json({
      status: invite.status,
      closed_reason: closedReason,
      team_name: invite.team_name,
      event: {
        name: event.name,
        event_date: event.event_date,
        level: event.level,
        description: event.description,
        location: event.location,
        hotel_name: event.hotel_name,
        hotel_url: event.hotel_url,
        fee_cents: event.fee_cents,
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

// Owner/coach/head_coach (own team only): sends a reminder (in-app
// notification + best-effort email) to one or more athletes' parents
// about a tournament invite they haven't finished responding to or
// paying for. Reuses the same
// notifications table/shape the tournament_invites_notify trigger already
// writes, and the same Resend pattern create-sponsorship-checkout uses for
// email -- nothing new invented, just applied on demand instead of only
// on insert.
//
// Deploy: supabase functions deploy send-tournament-reminder
// Secrets required: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SITE_URL
// Optional: RESEND_API_KEY, RECEIPT_EMAIL_FROM -- email is best-effort and
// the endpoint still succeeds (with the in-app notification sent) if unset;
// the response reports exactly how many emails actually went out so the
// admin UI can say so rather than silently claiming success.

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

    const { data: profile } = await callerClient.from("profiles").select("role").eq("id", userData.user.id).single();
    if (!profile || !["owner", "coach", "head_coach"].includes(profile.role)) {
      return json({ error: "Staff access required" }, 403);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const tournamentId = String(body.tournament_id || "");
    const athleteIds: string[] = Array.isArray(body.athlete_ids) ? body.athlete_ids.map(String) : [];
    if (!tournamentId || athleteIds.length === 0) {
      return json({ error: "tournament_id and athlete_ids are required" }, 400);
    }

    const { data: tournament } = await supabase
      .from("tournaments")
      .select("id, name, event_date, team_slug")
      .eq("id", tournamentId)
      .maybeSingle();
    if (!tournament) return json({ error: "Tournament not found" }, 404);

    // A head coach can only remind athletes for their own team's
    // tournaments -- the service-role client above bypasses RLS, so that
    // check has to happen here explicitly, same as send-team-announcement-email.
    if (profile.role === "head_coach") {
      if (!tournament.team_slug) return json({ error: "You can only send reminders for your own team's tournaments" }, 403);
      const { data: isHc } = await callerClient.rpc("is_head_coach_for", { target_team_slug: tournament.team_slug });
      if (!isHc) return json({ error: "You can only send reminders for your own team's tournaments" }, 403);
    }

    const { data: invites } = await supabase
      .from("tournament_invites")
      .select("id, athlete_id, token, status")
      .eq("tournament_id", tournamentId)
      .in("athlete_id", athleteIds);
    const inviteByAthlete = new Map((invites || []).map((i) => [i.athlete_id, i]));

    const { data: athletes } = await supabase
      .from("athletes")
      .select("id, full_name, parent_id")
      .in("id", athleteIds);

    const siteUrl = Deno.env.get("SITE_URL") ?? "https://eastcountyaquatics.github.io/website";
    const apiKey = Deno.env.get("RESEND_API_KEY");
    const from = Deno.env.get("RECEIPT_EMAIL_FROM") || "San Diego East County Aquatics <onboarding@resend.dev>";

    let notified = 0;
    let emailed = 0;
    const emailErrors: string[] = [];

    for (const athlete of athletes || []) {
      const invite = inviteByAthlete.get(athlete.id);
      if (!invite || !athlete.parent_id) continue;
      const link = `${siteUrl}/tournament-invite.html?token=${encodeURIComponent(invite.token)}`;
      const isUnpaidAccept = invite.status !== "paid";
      const title = `Reminder: ${athlete.full_name} and ${tournament.name}`;
      const bodyText = invite.status === "paid"
        ? `${athlete.full_name} is already paid up for ${tournament.name} -- no action needed.`
        : `Don't forget to respond${isUnpaidAccept ? " and pay" : ""} for ${athlete.full_name}'s spot in ${tournament.name}. ${link}`;

      const { error: notifError } = await supabase.from("notifications").insert({
        user_id: athlete.parent_id,
        type: "tournament_reminder",
        title,
        body: bodyText,
        data: { tournament_id: tournamentId, athlete_id: athlete.id, invite_token: invite.token, link },
      });
      if (!notifError) notified++;

      if (apiKey) {
        try {
          const { data: parentProfile } = await supabase.from("profiles").select("email").eq("id", athlete.parent_id).maybeSingle();
          if (parentProfile?.email) {
            const res = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                from,
                to: parentProfile.email,
                subject: title,
                text: `${bodyText}\n\nSan Diego East County Aquatics`,
              }),
            });
            if (res.ok) emailed++;
            else emailErrors.push(`${athlete.full_name}: ${res.status}`);
          }
        } catch (err) {
          emailErrors.push(`${athlete.full_name}: ${err instanceof Error ? err.message : "send failed"}`);
        }
      }
    }

    return json({
      ok: true,
      notified,
      emailed,
      email_configured: !!apiKey,
      email_errors: emailErrors,
    });
  } catch (err) {
    console.error(err);
    return json({ error: "Something went wrong sending reminders" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

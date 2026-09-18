// Owner/coach/head_coach (own team only): emails every parent on a team
// about a posted Team Interest announcement, plus an in-app notification.
// Same Resend + notifications pattern as send-tournament-reminder --
// nothing new invented, applied to a different table.
//
// Deploy: supabase functions deploy send-team-announcement-email
// Secrets required: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SITE_URL
// Optional: RESEND_API_KEY, RECEIPT_EMAIL_FROM -- email is best-effort and
// the endpoint still succeeds (with in-app notifications sent) if unset.

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

    const body = await req.json();
    const announcementId = String(body.announcement_id || "");
    if (!announcementId) return json({ error: "announcement_id is required" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: announcement } = await supabase
      .from("team_announcements")
      .select("id, team_slug, title, body, deadline")
      .eq("id", announcementId)
      .maybeSingle();
    if (!announcement) return json({ error: "Announcement not found" }, 404);

    // A head coach can only email their own team -- the service-role client
    // above bypasses RLS, so that check has to happen here explicitly rather
    // than relying on the announcement query having already filtered it.
    if (profile.role === "head_coach") {
      const { data: isHc } = await callerClient.rpc("is_head_coach_for", { target_team_slug: announcement.team_slug });
      if (!isHc) return json({ error: "You can only email your own team" }, 403);
    }

    const { data: athletes } = await supabase
      .from("athletes")
      .select("id, full_name, parent_id")
      .eq("team_slug", announcement.team_slug);

    const parentIds = Array.from(new Set((athletes || []).map((a) => a.parent_id).filter(Boolean)));
    if (parentIds.length === 0) {
      return json({ ok: true, notified: 0, emailed: 0, email_configured: false, email_errors: [], message: "No athletes with a parent on this team yet." });
    }

    const { data: parentProfiles } = await supabase.from("profiles").select("id, email").in("id", parentIds);

    const siteUrl = Deno.env.get("SITE_URL") ?? "https://eastcountyaquatics.github.io/website";
    const apiKey = Deno.env.get("RESEND_API_KEY");
    const from = Deno.env.get("RECEIPT_EMAIL_FROM") || "San Diego East County Aquatics <onboarding@resend.dev>";

    const link = `${siteUrl}/dashboard.html`;
    const deadlineNote = announcement.deadline
      ? ` Please respond by ${new Date(announcement.deadline + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric" })}.`
      : "";
    const subject = `Team Interest: ${announcement.title}`;
    const textBody = `${announcement.title}\n\n${announcement.body || ""}${deadlineNote}\n\nRespond on your dashboard: ${link}\n\nSan Diego East County Aquatics`;

    let notified = 0;
    let emailed = 0;
    const emailErrors: string[] = [];

    for (const parentId of parentIds) {
      // Idempotent-ish: this is a deliberate on-demand broadcast, not a
      // one-time trigger, so a retry after a partial failure re-sending to
      // everyone (including those who already got it) is the expected and
      // safe behavior here -- unlike a payment webhook, there's no risk of
      // double-charging, just a possible duplicate email.
      const { error: notifError } = await supabase.from("notifications").insert({
        user_id: parentId,
        type: "team_announcement_email",
        title: subject,
        body: `${announcement.body || ""}${deadlineNote}`.trim() || announcement.title,
        data: { announcement_id: announcementId, team_slug: announcement.team_slug, link },
      });
      if (!notifError) notified++;

      if (apiKey) {
        try {
          const parentProfile = (parentProfiles || []).find((p) => p.id === parentId);
          if (parentProfile?.email) {
            const res = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
              body: JSON.stringify({ from, to: parentProfile.email, subject, text: textBody }),
            });
            if (res.ok) emailed++;
            else emailErrors.push(`${parentProfile.email}: ${res.status}`);
          }
        } catch (err) {
          emailErrors.push(err instanceof Error ? err.message : "send failed");
        }
      }
    }

    return json({ ok: true, notified, emailed, email_configured: !!apiKey, email_errors: emailErrors, parent_count: parentIds.length });
  } catch (err) {
    console.error(err);
    return json({ error: "Something went wrong sending the announcement email" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

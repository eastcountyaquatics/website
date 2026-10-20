// Manager / Head Coach (own team only): sends a message to every family on
// a team, or just to one subgroup of it (Goalies, A squad...). It lands on
// each family's My Account as a notification and, when Resend is set up,
// in their inbox. Same pattern as send-team-announcement-email.
//
// Deploy: supabase functions deploy send-team-message
// Secrets required: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SITE_URL
// Optional: RESEND_API_KEY, RECEIPT_EMAIL_FROM -- email is best-effort.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

    const caller = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await caller.auth.getUser();
    if (userError || !userData.user) return json({ error: "Not signed in" }, 401);
    const userId = userData.user.id;

    const { data: profile } = await caller.from("profiles").select("role, full_name").eq("id", userId).single();
    if (!profile || !["owner", "head_coach"].includes(profile.role)) {
      return json({ error: "Only the club manager or a team's head coach can send team messages" }, 403);
    }

    const body = await req.json();
    const teamSlug = String(body.team_slug || "").trim();
    const subgroupId = body.subgroup_id ? String(body.subgroup_id) : null;
    const subject = String(body.subject || "").trim();
    const text = String(body.body || "").trim();
    const sendEmail = body.send_email !== false;
    if (!teamSlug) return json({ error: "Choose a team" }, 400);
    if (!subject || subject.length > 200) return json({ error: "Add a subject (200 characters max)" }, 400);
    if (!text || text.length > 2000) return json({ error: "Add a message (2000 characters max)" }, 400);

    if (profile.role === "head_coach") {
      const { data: isHc } = await caller.rpc("is_head_coach_for", { target_team_slug: teamSlug });
      if (!isHc) return json({ error: "You can only message your own team" }, 403);
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    let athleteIds: string[] = [];
    let audience = "Whole team";
    if (subgroupId) {
      const { data: group } = await supabase.from("team_subgroups").select("id, name, team_slug").eq("id", subgroupId).maybeSingle();
      if (!group || group.team_slug !== teamSlug) return json({ error: "That group isn't on this team" }, 404);
      audience = group.name;
      const { data: members } = await supabase.from("team_subgroup_members").select("athlete_id").eq("subgroup_id", subgroupId);
      athleteIds = (members || []).map((m) => m.athlete_id);
    } else {
      const [{ data: allAthletes }, { data: activeRows }] = await Promise.all([
        supabase.from("athletes").select("id, team_slug, birthdate, sex"),
        supabase.rpc("active_athlete_ids"),
      ]);
      const active = new Set((activeRows || []).map((r: unknown) => typeof r === "string" ? r : (r as { active_athlete_ids: string }).active_athlete_ids));
      athleteIds = (allAthletes || []).filter((a) => active.has(a.id) && athleteTeamSlug(a) === teamSlug).map((a) => a.id);
    }

    const { data: kids } = athleteIds.length
      ? await supabase.from("athletes").select("id, parent_id").in("id", athleteIds)
      : { data: [] as { id: string; parent_id: string | null }[] };
    const parentIds = Array.from(new Set((kids || []).map((k) => k.parent_id).filter(Boolean) as string[]));
    if (parentIds.length === 0) {
      return json({ ok: true, notified: 0, emailed: 0, family_count: 0, message: "No families to send to yet." });
    }

    const { data: parents } = await supabase.from("profiles").select("id, email").in("id", parentIds);
    const siteUrl = Deno.env.get("SITE_URL") ?? "https://eastcountyaquatics.github.io/website";
    const apiKey = sendEmail ? Deno.env.get("RESEND_API_KEY") : undefined;
    const from = Deno.env.get("RECEIPT_EMAIL_FROM") || "San Diego East County Aquatics <onboarding@resend.dev>";
    const link = `${siteUrl}/dashboard.html`;
    const sender = profile.full_name || "ECA";
    const m = await emailFor(supabase, "team_message", { subject, message: text, sender, link },
      { subject: "{{subject}}", body: "{{message}}\n\n— {{sender}}, San Diego East County Aquatics\nYou can also see this on My Account: {{link}}" });
    const emailText = m.text;
    const emailSubject = m.subject || subject;

    let notified = 0;
    let emailed = 0;
    const emailErrors: string[] = [];
    for (const parentId of parentIds) {
      const { error } = await supabase.from("notifications").insert({
        user_id: parentId,
        type: "team_message",
        title: subject,
        body: text,
        data: { team_slug: teamSlug, subgroup_id: subgroupId, link },
      });
      if (!error) notified++;

      if (apiKey) {
        const email = (parents || []).find((p) => p.id === parentId)?.email;
        if (email) {
          try {
            const res = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
              body: JSON.stringify({ from, to: email, subject: emailSubject, text: emailText }),
            });
            if (res.ok) emailed++;
            else emailErrors.push(`${email}: ${res.status}`);
          } catch (err) {
            emailErrors.push(err instanceof Error ? err.message : "send failed");
          }
        }
      }
    }

    await supabase.from("team_messages").insert({
      team_slug: teamSlug, subgroup_id: subgroupId, audience_label: audience, subject, body: text,
      sent_by: userId, families_notified: notified, families_emailed: emailed,
    });

    return json({ ok: true, notified, emailed, family_count: parentIds.length, email_configured: !!Deno.env.get("RESEND_API_KEY"), email_errors: emailErrors });
  } catch (err) {
    console.error(err);
    return json({ error: "Something went wrong sending the message" }, 500);
  }
});

// NOTE: duplicated from send-team-announcement-email. Same rule as the site
// and public.athlete_team_slug.
function athleteTeamSlug(a: { team_slug: string | null; birthdate: string | null; sex: string | null }): string | null {
  if (a.team_slug) return a.team_slug;
  if (!a.birthdate) return null;
  const now = new Date();
  const seasonYear = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  const [y, m, d] = a.birthdate.split("-").map(Number);
  let age = seasonYear + 1 - y;
  if (m > 8 || (m === 8 && d > 1)) age--;
  if (age > 18) return "masters";
  const bracket = age <= 8 ? "8u" : age <= 10 ? "10u" : age <= 12 ? "12u" : age <= 14 ? "14u" : age <= 16 ? "16u" : "18u";
  if (bracket === "8u" || bracket === "10u") return bracket + "-coed";
  const sex = (a.sex || "").toLowerCase();
  return sex === "male" ? bracket + "-boys" : sex === "female" ? bracket + "-girls" : null;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Owner-edited wording from Admin > Emails (email_templates), else the
// built-in text. {{fill_ins}} are replaced from vars. Never throws: a missing
// table or row just means the built-in wording is used.
// NOTE: duplicated in every function that sends email; the built-in wording
// must match js/email-catalog.js.
// deno-lint-ignore no-explicit-any
async function emailFor(db: any, key: string, vars: Record<string, string | number | null | undefined>, fallback: { subject: string; body: string }) {
  let t = fallback;
  try {
    const { data } = await db.from("email_templates").select("subject, body").eq("key", key).maybeSingle();
    if (data && data.subject && data.body) t = { subject: data.subject, body: data.body };
  } catch (_) { /* built-in wording */ }
  const fill = (s: string) => s.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (m, k) => (k in vars ? String(vars[k] ?? "") : m));
  return { subject: fill(t.subject).replace(/\s+/g, " ").trim().slice(0, 250), text: fill(t.body) };
}

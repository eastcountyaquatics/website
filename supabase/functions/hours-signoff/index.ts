// Public, no login required: backs hours-signoff.html, the page a coach
// lands on from their month-end "please confirm your hours" email (sent
// by send-monthly-hours-signoff). The random, unguessable token in the
// link is what protects this, the same as tournament invite links.
//
//   { token, action: "get" }      -> the coach's hours for that month
//   { token, action: "respond", decision: "signed_off" | "edits_requested", note? }
//                                  -> records the answer and emails it to
//                                     Clint & Marcy (HOURS_SIGNOFF_NOTIFY_EMAILS)
//
// Deploy: supabase functions deploy hours-signoff --no-verify-jwt
// Secrets required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY
// Optional: RECEIPT_EMAIL_FROM; HOURS_SIGNOFF_NOTIFY_EMAILS (comma-separated,
// defaults to the club inbox)

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

    const { data: signoff } = await supabase
      .from("coach_hours_signoffs")
      .select("id, coach_id, period_month, status, coach_note, responded_at")
      .eq("token", token)
      .maybeSingle();
    if (!signoff) return json({ error: "This link is not valid. Please contact the club." }, 404);

    const [year, mon] = signoff.period_month.split("-").map(Number);
    const lastDay = new Date(Date.UTC(year, mon, 0)).getUTCDate();
    const periodEnd = `${signoff.period_month.slice(0, 7)}-${String(lastDay).padStart(2, "0")}`;
    const monthLabel = new Date(Date.UTC(year, mon - 1, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

    const [{ data: coach }, { data: rows }, { data: teams }] = await Promise.all([
      supabase.from("profiles").select("full_name, email").eq("id", signoff.coach_id).maybeSingle(),
      supabase.from("coach_hours")
        .select("session_date, session_end_date, session_type, team_slug, tournament_name, hours, travel_days")
        .eq("coach_id", signoff.coach_id)
        .gte("session_date", signoff.period_month)
        .lte("session_date", periodEnd)
        .order("session_date", { ascending: true }),
      supabase.from("schedules").select("team_slug, team_label"),
    ]);
    const teamLabel = new Map((teams || []).map((t) => [t.team_slug, t.team_label]));
    const entries = (rows || []).map((r) => ({
      date: r.session_date,
      end_date: r.session_end_date,
      type: r.session_type,
      team: teamLabel.get(r.team_slug) || r.team_slug,
      tournament_name: r.tournament_name,
      hours: Number(r.hours),
      travel_days: r.travel_days || 0,
    }));
    const totalHours = entries.reduce((s, e) => s + e.hours, 0);
    const totalTravel = entries.reduce((s, e) => s + e.travel_days, 0);

    if (body.action !== "respond") {
      return json({
        coach_name: coach?.full_name || "Coach",
        month_label: monthLabel,
        status: signoff.status,
        coach_note: signoff.coach_note,
        responded_at: signoff.responded_at,
        entries,
        total_hours: totalHours,
        total_travel_days: totalTravel,
      });
    }

    const decision = String(body.decision || "");
    if (decision !== "signed_off" && decision !== "edits_requested") {
      return json({ error: "Choose Sign Off or Request Edits." }, 400);
    }
    const note = String(body.note || "").trim().slice(0, 2000);
    if (decision === "edits_requested" && !note) {
      return json({ error: "Please describe what needs to change." }, 400);
    }

    const { error: updateError } = await supabase
      .from("coach_hours_signoffs")
      .update({ status: decision, coach_note: note || null, total_hours: totalHours, responded_at: new Date().toISOString() })
      .eq("id", signoff.id);
    if (updateError) throw updateError;

    const coachName = coach?.full_name || "A coach";
    const lines = entries.map((e) => {
      const dates = e.end_date ? `${e.date} to ${e.end_date}` : e.date;
      const what = e.type === "tournament" ? `${e.tournament_name || "Tournament"} (${e.team})` : `Practice (${e.team})`;
      return `  ${dates}  ${what}  ${e.hours.toFixed(2)} hrs${e.travel_days ? `, ${e.travel_days} travel day(s)` : ""}`;
    }).join("\n");
    const subject = decision === "signed_off"
      ? `${coachName} signed off on ${monthLabel} hours`
      : `${coachName} requested edits to ${monthLabel} hours`;
    const text =
      (decision === "signed_off"
        ? `${coachName} confirmed their ${monthLabel} hours are complete and accurate.\n\n`
        : `${coachName} says their ${monthLabel} hours need changes:\n\n"${note}"\n\n`) +
      (decision === "signed_off" && note ? `Their note: "${note}"\n\n` : "") +
      `Total: ${totalHours.toFixed(2)} hrs` + (totalTravel ? `, ${totalTravel} travel day(s)` : "") + `\n\n` +
      `Sessions:\n${lines || "  (none)"}\n\n` +
      (coach?.email ? `Coach email: ${coach.email}\n` : "") +
      `Review on the Coach Pay page of the admin site.`;

    const notifyTo = (Deno.env.get("HOURS_SIGNOFF_NOTIFY_EMAILS") || "eastcountyaquatics@gmail.com")
      .split(",").map((s) => s.trim()).filter(Boolean);
    await sendEmail(notifyTo, subject, text, coach?.email || undefined);

    return json({ ok: true, status: decision });
  } catch (err) {
    console.error(err);
    return json({ error: "Something went wrong" }, 500);
  }
});

// Best-effort, same Resend pattern as the other functions: the coach's
// answer is already saved (and visible on Coach Pay) even if email fails.
async function sendEmail(to: string[], subject: string, text: string, replyTo?: string): Promise<void> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return;
  const from = Deno.env.get("RECEIPT_EMAIL_FROM") || "San Diego East County Aquatics <onboarding@resend.dev>";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, text, ...(replyTo ? { reply_to: replyTo } : {}) }),
    });
    if (!res.ok) console.error("Resend sign-off notification failed:", res.status, await res.text());
  } catch (err) {
    console.error("Resend sign-off notification threw:", err);
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

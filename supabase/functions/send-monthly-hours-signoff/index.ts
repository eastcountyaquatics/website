// Month-end hours sign-off: emails every coach who logged hours in a month
// a private link (hours-signoff.html?token=...) to review those hours and
// either sign off or ask for edits. The answer is handled by the
// hours-signoff function, which emails Finance.SD.ECA@gmail.com.
//
// Two ways in:
//   1. The monthly pg_cron job (see the monthly_hours_signoff_cron
//      migration) calls this on the evening of the last day of each month
//      with header x-cron-secret and no body, meaning "the month that's
//      ending". The secret lives only in the database's Vault; this
//      function checks it with the check_hours_signoff_cron_secret() RPC
//      (service role only), so there's no separate function secret to set.
//   2. An owner clicks "Send sign-off emails" on Coach Pay, with their own
//      JWT and an explicit { month: "YYYY-MM" }.
//
// Re-running for the same month is safe: a coach who already signed off is
// skipped, and anyone else gets the SAME link again (the unique
// (coach_id, period_month) row is reused, not duplicated).
//
// Deploy: supabase functions deploy send-monthly-hours-signoff --no-verify-jwt
// (the cron job has no user JWT; the shared secret or an owner JWT is
// checked below instead)
// Secrets required: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
//   SITE_URL, RESEND_API_KEY
// Optional: RECEIPT_EMAIL_FROM

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const cronHeader = req.headers.get("x-cron-secret");
    let isCron = false;
    if (cronHeader) {
      const { data: ok } = await supabase.rpc("check_hours_signoff_cron_secret", { candidate: cronHeader });
      isCron = ok === true;
    }

    if (!isCron) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return json({ error: "Not authorized" }, 401);
      const callerClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: userData, error: userError } = await callerClient.auth.getUser();
      if (userError || !userData.user) return json({ error: "Not signed in" }, 401);
      const { data: profile } = await callerClient.from("profiles").select("role").eq("id", userData.user.id).single();
      if (!profile || profile.role !== "owner") return json({ error: "Owner access required" }, 403);
    }

    let body: { month?: string } = {};
    try { body = await req.json(); } catch { /* cron sends no body */ }

    const month = /^\d{4}-\d{2}$/.test(String(body.month || "")) ? String(body.month) : monthEndingPacific();
    const [year, mon] = month.split("-").map(Number);
    const periodStart = `${month}-01`;
    const lastDay = new Date(Date.UTC(year, mon, 0)).getUTCDate();
    const periodEnd = `${month}-${String(lastDay).padStart(2, "0")}`;
    const monthLabel = new Date(Date.UTC(year, mon - 1, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

    const { data: hoursRows, error: hoursError } = await supabase
      .from("coach_hours")
      .select("coach_id, hours, travel_days")
      .gte("session_date", periodStart)
      .lte("session_date", periodEnd);
    if (hoursError) throw hoursError;

    const totals = new Map<string, { hours: number; travelDays: number; sessions: number }>();
    for (const r of hoursRows || []) {
      const t = totals.get(r.coach_id) || { hours: 0, travelDays: 0, sessions: 0 };
      t.hours += Number(r.hours);
      t.travelDays += r.travel_days || 0;
      t.sessions += 1;
      totals.set(r.coach_id, t);
    }
    const coachIds = [...totals.keys()];
    if (coachIds.length === 0) return json({ ok: true, month, sent: 0, skipped: 0, message: "No hours logged that month." });

    const [{ data: profiles }, { data: existing }] = await Promise.all([
      supabase.from("profiles").select("id, full_name, email").in("id", coachIds),
      supabase.from("coach_hours_signoffs").select("id, coach_id, token, status").eq("period_month", periodStart).in("coach_id", coachIds),
    ]);
    const existingByCoach = new Map((existing || []).map((s) => [s.coach_id, s]));

    const siteUrl = Deno.env.get("SITE_URL") ?? "https://eastcountyaquatics.github.io/website";
    const apiKey = Deno.env.get("RESEND_API_KEY");
    const from = Deno.env.get("RECEIPT_EMAIL_FROM") || "San Diego East County Aquatics <onboarding@resend.dev>";

    let sent = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const p of profiles || []) {
      const t = totals.get(p.id)!;
      let row = existingByCoach.get(p.id);
      // Already signed off -> leave it alone. Edits requested -> the owner
      // has presumably fixed the hours, so re-sending asks the coach to
      // confirm the corrected numbers with the same link.
      if (row && row.status === "signed_off") { skipped++; continue; }

      if (row) {
        await supabase.from("coach_hours_signoffs")
          .update({ total_hours: t.hours, status: "pending", sent_at: new Date().toISOString() })
          .eq("id", row.id);
      } else {
        const { data: inserted, error } = await supabase.from("coach_hours_signoffs")
          .insert({ coach_id: p.id, period_month: periodStart, total_hours: t.hours })
          .select("id, coach_id, token, status")
          .single();
        if (error || !inserted) { errors.push(`${p.full_name || p.id}: could not create sign-off`); continue; }
        row = inserted;
      }

      if (!apiKey || !p.email) {
        errors.push(`${p.full_name || p.id}: ${!apiKey ? "email not configured" : "no email on file"}`);
        continue;
      }

      const link = `${siteUrl}/hours-signoff.html?token=${encodeURIComponent(row!.token)}`;
      const text =
        `Hi ${p.full_name || "Coach"},\n\n` +
        `Please confirm your coaching hours for ${monthLabel}:\n\n` +
        `  Total hours: ${t.hours.toFixed(2)} (${t.sessions} session${t.sessions === 1 ? "" : "s"})\n` +
        (t.travelDays ? `  Travel days: ${t.travelDays}\n` : "") +
        `\nReview every session and either sign off or request edits here:\n${link}\n\n` +
        `Thank you!\nSan Diego East County Aquatics`;
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from, to: p.email, subject: `Please confirm your ${monthLabel} coaching hours`, text }),
        });
        if (res.ok) sent++;
        else errors.push(`${p.full_name || p.id}: email failed (${res.status})`);
      } catch (err) {
        errors.push(`${p.full_name || p.id}: ${err instanceof Error ? err.message : "email failed"}`);
      }
    }

    return json({ ok: true, month, sent, skipped, errors });
  } catch (err) {
    console.error(err);
    return json({ error: "Something went wrong sending sign-off emails" }, 500);
  }
});

// The club runs on Pacific time. The cron job fires at 03:00 UTC on the
// 1st, which is still the evening of the LAST day of the month in San
// Diego -- so late in a month means "this month"; early in a month (a late
// or manual run) means "the month that just ended".
function monthEndingPacific(): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", year: "numeric", month: "numeric", day: "numeric" })
    .formatToParts(new Date());
  let year = Number(parts.find((x) => x.type === "year")!.value);
  let month = Number(parts.find((x) => x.type === "month")!.value);
  const day = Number(parts.find((x) => x.type === "day")!.value);
  if (day < 20) {
    month -= 1;
    if (month === 0) { month = 12; year -= 1; }
  }
  return `${year}-${String(month).padStart(2, "0")}`;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

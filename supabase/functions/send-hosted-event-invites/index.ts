// Manager-only: emails visiting teams their personal signup link for a
// hosted event (admin-hosted-events.html), right after they're invited --
// or again later with "Email Invite". Each invite has its own token, so
// every team gets its own link; nobody needs a login to pay.
//
// Sent through Resend. Until the club's sending domain is verified in
// Resend, Resend only delivers to the club's own address; those come back
// as not sent (with the reason), and the page offers the link to send by
// hand instead.
//
// Deploy: supabase functions deploy send-hosted-event-invites
// Secrets required: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SITE_URL
// Optional: RESEND_API_KEY, RECEIPT_EMAIL_FROM

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CLUB_EMAIL = "eastcountyaquatics@gmail.com";

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
    const { data: caller } = await callerClient.from("profiles").select("role").eq("id", userData.user.id).single();
    if (!caller || caller.role !== "owner") return json({ error: "Manager access required" }, 403);

    const body = await req.json();
    const inviteIds: string[] = Array.isArray(body.invite_ids)
      ? body.invite_ids.map((x: unknown) => String(x)).filter(Boolean).slice(0, 200)
      : [];
    if (!inviteIds.length) return json({ error: "No invites to send" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: invites, error: invitesError } = await admin
      .from("hosted_event_invites")
      .select("id, event_id, team_name, contact_name, contact_email, token, status")
      .in("id", inviteIds);
    if (invitesError) return json({ error: invitesError.message }, 500);

    const eventIds = [...new Set((invites ?? []).map((i) => i.event_id))];
    const { data: events } = await admin
      .from("hosted_events")
      .select("id, name, event_date, end_date, additional_dates, levels, location, description, fee_cents")
      .in("id", eventIds);
    const eventById = new Map((events ?? []).map((e) => [e.id, e]));

    const siteUrl = Deno.env.get("SITE_URL") ?? "https://eastcountyaquatics.github.io/website";
    const apiKey = Deno.env.get("RESEND_API_KEY");
    const from = Deno.env.get("RECEIPT_EMAIL_FROM") || "San Diego East County Aquatics <onboarding@resend.dev>";

    const results: { id: string; email: string; ok: boolean; reason?: string }[] = [];
    for (const inv of invites ?? []) {
      const ev = eventById.get(inv.event_id);
      if (!ev) { results.push({ id: inv.id, email: inv.contact_email, ok: false, reason: "event not found" }); continue; }
      if (inv.status === "paid") { results.push({ id: inv.id, email: inv.contact_email, ok: false, reason: "already paid" }); continue; }
      if (!apiKey) { results.push({ id: inv.id, email: inv.contact_email, ok: false, reason: "the club's email isn't set up" }); continue; }

      const link = `${siteUrl}/hosted-event-signup.html?token=${encodeURIComponent(inv.token)}`;
      const greeting = inv.contact_name ? `Hi ${inv.contact_name.split(" ")[0]},` : "Hi,";
      const details = [
        `Date: ${formatEventDates(ev)}`,
        ev.location ? `Location: ${ev.location}` : null,
        ev.levels && ev.levels.length ? `Age / Level: ${ev.levels.join(", ")}` : null,
        `Team fee: ${formatAmount(ev.fee_cents)}`,
      ].filter(Boolean);
      const lines = [
        greeting,
        "",
        `${inv.team_name ? inv.team_name + " is" : "Your team is"} invited to ${ev.name}, hosted by San Diego East County Aquatics.`,
        "",
        ...details,
        ...(ev.description ? ["", ev.description] : []),
        "",
        "Sign up and pay your team's fee here (no account needed):",
        link,
        "",
        `Questions? Just reply to this email or write to ${CLUB_EMAIL}.`,
        "",
        "San Diego East County Aquatics",
      ];
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from,
            to: inv.contact_email,
            reply_to: CLUB_EMAIL,
            subject: `You're invited: ${ev.name}`,
            text: lines.join("\n"),
          }),
        });
        if (res.ok) {
          await admin.from("hosted_event_invites").update({ emailed_at: new Date().toISOString() }).eq("id", inv.id);
          results.push({ id: inv.id, email: inv.contact_email, ok: true });
        } else {
          const detail = await res.text();
          const sandboxed = res.status === 403 || /testing emails|verify a domain/i.test(detail);
          console.error(`Hosted event invite to ${inv.contact_email} failed: ${res.status} ${detail}`);
          results.push({
            id: inv.id,
            email: inv.contact_email,
            ok: false,
            reason: sandboxed ? "the club's email domain isn't verified yet" : `email failed (${res.status})`,
          });
        }
      } catch (err) {
        results.push({ id: inv.id, email: inv.contact_email, ok: false, reason: err instanceof Error ? err.message : "email failed" });
      }
    }

    return json({ ok: true, sent: results.filter((r) => r.ok).length, results });
  } catch (err) {
    console.error(err);
    return json({ error: "Something went wrong sending invites" }, 500);
  }
});

function formatAmount(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((cents || 0) / 100);
}
function formatDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "long", day: "numeric", year: "numeric" });
}
function formatEventDates(ev: { event_date: string; end_date: string | null; additional_dates: string[] | null }) {
  const extra = (ev.additional_dates || []).slice().sort();
  if (ev.end_date && ev.end_date !== ev.event_date) return `${formatDate(ev.event_date)} – ${formatDate(ev.end_date)}`;
  if (extra.length) return [ev.event_date].concat(extra).map(formatDate).join(", ");
  return formatDate(ev.event_date);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

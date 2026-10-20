// Manager-only: emails visiting teams their personal signup link for a
// hosted event (admin-hosted-events.html), right after they're invited --
// or again later with "Email Invite". Each invite has its own token, so
// every team gets its own link; nobody needs a login to pay.
//
// mode "update" (editing an event with "Email the invited teams" ticked):
// emails every team invited to event_id -- paid ones too -- what changed,
// with an optional note from the Manager, the current details and their
// link. Teams invited in the same save (exclude_ids) already got the
// current details in their invite, so they're skipped.
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
    const isUpdate = body.mode === "update";
    const ids = (v: unknown) => Array.isArray(v) ? v.map((x: unknown) => String(x)).filter(Boolean).slice(0, 200) : [];
    const inviteIds = ids(body.invite_ids);
    const excludeIds = ids(body.exclude_ids);
    const eventId = String(body.event_id || "");
    const changes: string[] = ids(body.changes).map((c) => c.slice(0, 300)).slice(0, 20);
    const note = String(body.note || "").trim().slice(0, 2000);
    if (isUpdate ? !eventId : !inviteIds.length) return json({ error: "No invites to send" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let inviteQuery = admin
      .from("hosted_event_invites")
      .select("id, event_id, team_name, contact_name, contact_email, token, status");
    inviteQuery = isUpdate ? inviteQuery.eq("event_id", eventId) : inviteQuery.in("id", inviteIds);
    const { data: allInvites, error: invitesError } = await inviteQuery;
    if (invitesError) return json({ error: invitesError.message }, 500);
    const invites = (allInvites ?? []).filter((i) => excludeIds.indexOf(i.id) === -1);

    const eventIds = [...new Set((invites ?? []).map((i) => i.event_id))];
    const { data: events } = await admin
      .from("hosted_events")
      .select("id, name, event_date, end_date, additional_dates, levels, location, description, fee_cents, price_by_level, level_prices")
      .in("id", eventIds);
    const eventById = new Map((events ?? []).map((e) => [e.id, e]));

    const siteUrl = Deno.env.get("SITE_URL") ?? "https://eastcountyaquatics.github.io/website";
    const apiKey = Deno.env.get("RESEND_API_KEY");
    const from = Deno.env.get("RECEIPT_EMAIL_FROM") || "San Diego East County Aquatics <onboarding@resend.dev>";

    const results: { id: string; email: string; ok: boolean; reason?: string }[] = [];
    for (const inv of invites ?? []) {
      const ev = eventById.get(inv.event_id);
      if (!ev) { results.push({ id: inv.id, email: inv.contact_email, ok: false, reason: "event not found" }); continue; }
      if (inv.status === "paid" && !isUpdate) { results.push({ id: inv.id, email: inv.contact_email, ok: false, reason: "already paid" }); continue; }
      if (!apiKey) { results.push({ id: inv.id, email: inv.contact_email, ok: false, reason: "the club's email isn't set up" }); continue; }

      const link = `${siteUrl}/hosted-event-signup.html?token=${encodeURIComponent(inv.token)}`;
      const greeting = inv.contact_name ? `Hi ${inv.contact_name.split(" ")[0]},` : "Hi,";
      const details = [
        `Date: ${formatEventDates(ev)}`,
        ev.location ? `Location: ${ev.location}` : null,
        ...(ev.price_by_level && (ev.level_prices || []).length
          ? ["Age groups and fee per team:", ...ev.level_prices.map((p: { level: string; fee_cents: number }) => `  ${p.level}: ${formatAmount(p.fee_cents)}`)]
          : [
            ev.levels && ev.levels.length ? `Age groups: ${ev.levels.join(", ")}` : null,
            `Fee per team: ${formatAmount(ev.fee_cents)}`,
          ]),
      ].filter(Boolean);
      const paid = inv.status === "paid";
      const m = isUpdate
        ? await emailFor(admin, "event_update", {
          greeting, event_name: ev.name,
          changes: changes.length ? "\n\nWhat changed:\n" + changes.map((c) => `  - ${c}`).join("\n") : "",
          note: note ? "\n\n" + note : "",
          details: details.join("\n"),
          next_step: paid
            ? `${inv.team_name || "Your team"} is registered -- nothing else to do. Details and the latest schedule:`
            : "Pick your teams and pay here (no account needed):",
          link, club_email: CLUB_EMAIL,
        }, {
          subject: "Update: {{event_name}}",
          body: "{{greeting}}\n\nThere's an update to {{event_name}}, hosted by San Diego East County Aquatics.{{changes}}{{note}}\n\nEvent details now:\n{{details}}\n\n{{next_step}}\n{{link}}\n\nQuestions? Just reply to this email or write to {{club_email}}.\n\nSan Diego East County Aquatics",
        })
        : await emailFor(admin, "event_invite", {
          greeting, team_is: inv.team_name ? inv.team_name + " is" : "Your team is", event_name: ev.name,
          details: details.join("\n"), description: ev.description ? "\n\n" + ev.description : "",
          link, club_email: CLUB_EMAIL,
        }, {
          subject: "You're invited: {{event_name}}",
          body: "{{greeting}}\n\n{{team_is}} invited to {{event_name}}, hosted by San Diego East County Aquatics.\n\n{{details}}{{description}}\n\nPick your teams and pay here (no account needed):\n{{link}}\n\nQuestions? Just reply to this email or write to {{club_email}}.\n\nSan Diego East County Aquatics",
        });
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from,
            to: inv.contact_email,
            reply_to: CLUB_EMAIL,
            subject: m.subject,
            text: m.text,
          }),
        });
        if (res.ok) {
          if (!isUpdate) await admin.from("hosted_event_invites").update({ emailed_at: new Date().toISOString() }).eq("id", inv.id);
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

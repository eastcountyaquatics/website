// Records Zeffy payments into public.purchases and ties each one to the
// athlete it's for. Families pay on Zeffy-hosted forms (registration,
// tournaments, Masters, donations); Zeffy calls this for every payment.
//
// Matching: the family is the ECA account whose email is the payer's
// email; the athlete is the name typed into the form's athlete question
// (one per ticket on a multi-athlete order). A line that can't be matched
// goes to zeffy_unmatched for the Manager (Admin > Zeffy).
//
// Deploy: supabase functions deploy zeffy-webhook --no-verify-jwt
// (Zeffy calls this directly; the Zeffy-Signature check is what secures it)
//
// Secrets required: ZEFFY_WEBHOOK_SECRET (whsec_...), ZEFFY_API_KEY,
// SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY. Optional: RESEND_API_KEY,
// RECEIPT_EMAIL_FROM.
//
// Then in Zeffy: Settings -> Integrations -> Webhook, paste this
// function's URL and subscribe to payment.completed and payment.updated.

import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

const ZEFFY_API = "https://api.zeffy.com/api/v1";
const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

type QuestionAnswer = { question: string; type: string; answer: string | string[] | boolean | null };
type Item = {
  id: string;
  type: "donation" | "ticket" | "additional_donation";
  amount: number;
  rate_title: string | null;
  questions: QuestionAnswer[] | null;
};
type Payment = {
  id: string;
  created: number;
  amount: number;
  currency: string;
  status: string;
  refund_status: "none" | "partial" | "full";
  description: string;
  campaign_id: string;
  buyer: { email: string; first_name: string; last_name: string; company_name: string | null } | null;
  buyer_questions: QuestionAnswer[] | null;
  items: Item[] | null;
};
type Kind = "registration" | "tournament" | "masters" | "donation" | "other";

Deno.serve(async (req) => {
  const rawBody = await req.text();
  if (!(await signatureValid(rawBody, req.headers.get("Zeffy-Signature") ?? ""))) {
    return new Response("Invalid signature", { status: 400 });
  }

  let event: { id: string; type: string; data: Record<string, unknown> };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const paymentRef = (event.data && (event.data.id as string)) || null;

  try {
    let result: string;
    if (event.type === "payment.completed") {
      result = await recordPayment(supabase, event.data as unknown as Payment);
    } else if (event.type === "payment.updated") {
      // Updated events carry only the id -- read the payment's current state.
      result = await syncRefund(supabase, await fetchPayment(paymentRef!));
    } else {
      result = "ignored";
    }
    await logEvent(supabase, event, result === "ignored" ? "ignored" : "processed", paymentRef);
    return new Response(result, { status: 200 });
  } catch (err) {
    // 500 so Zeffy retries (it keeps trying for up to 3 days); the log row
    // shows up on Admin > Health in the meantime.
    console.error("Zeffy webhook failed:", err);
    await logEvent(supabase, event, "error", paymentRef, String((err as Error)?.message ?? err));
    return new Response("handler failed", { status: 500 });
  }
});

// HMAC-SHA256 of "{t}.{rawBody}" with the signing secret, hex-encoded (v1).
async function signatureValid(rawBody: string, header: string): Promise<boolean> {
  const secret = Deno.env.get("ZEFFY_WEBHOOK_SECRET");
  if (!secret || !header) return false;
  const parts: Record<string, string> = {};
  header.split(",").forEach((p) => {
    const i = p.indexOf("=");
    if (i > 0) parts[p.slice(0, i).trim()] = p.slice(i + 1).trim();
  });
  const t = Number(parts.t);
  if (!Number.isFinite(t) || Math.abs(Date.now() / 1000 - t) > SIGNATURE_TOLERANCE_SECONDS) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${parts.t}.${rawBody}`)));
  const expected = Array.from(mac, (b) => b.toString(16).padStart(2, "0")).join("");
  const received = (parts.v1 || "").toLowerCase();
  if (expected.length !== received.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ received.charCodeAt(i);
  return diff === 0;
}

async function fetchPayment(id: string): Promise<Payment> {
  const res = await fetch(`${ZEFFY_API}/payments/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${Deno.env.get("ZEFFY_API_KEY")}` },
  });
  if (!res.ok) throw new Error(`Zeffy API ${res.status} reading payment ${id}`);
  return await res.json();
}

async function logEvent(
  supabase: SupabaseClient,
  event: { id: string; type: string },
  status: "processed" | "ignored" | "error",
  reference: string | null,
  errorMessage?: string,
) {
  try {
    // webhook_events is shared with Stripe; the prefix keeps the ids apart.
    await supabase.from("webhook_events").upsert(
      { stripe_event_id: "zeffy:" + event.id, event_type: "zeffy." + event.type, status, error_message: errorMessage ?? null, reference },
      { onConflict: "stripe_event_id" },
    );
  } catch (err) {
    console.error("Could not log Zeffy event:", err);
  }
}

// ilike with no wildcards: "a_b@x.com" must not match "acb@x.com".
function likeExact(s: string): string {
  return s.replace(/[\\%_]/g, (c) => "\\" + c);
}

// "  Mary-Kate  O'Neil " -> "marykate oneil"
function normName(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[^a-z\s]/g, "").replace(/\s+/g, " ").trim();
}

// The athlete's name from a set of answers: the question that mentions the
// athlete/player/swimmer, else a lone "name"-type question.
function athleteNameFrom(questions: QuestionAnswer[] | null | undefined): string | null {
  const qs = (questions ?? []).filter((q) => typeof q.answer === "string" && (q.answer as string).trim());
  const named = qs.find((q) => /athlete|player|swimmer|participant|child/i.test(q.question)) ??
    (qs.filter((q) => q.type === "name").length === 1 ? qs.find((q) => q.type === "name") : undefined);
  return named ? (named.answer as string).trim() : null;
}

async function campaignFor(supabase: SupabaseClient, payment: Payment): Promise<{ kind: Kind; title: string; tournament_id: string | null }> {
  const { data } = await supabase
    .from("zeffy_campaigns")
    .select("kind, title, tournament_id")
    .eq("campaign_id", payment.campaign_id)
    .maybeSingle();
  if (data) return { kind: data.kind as Kind, title: data.title || payment.description, tournament_id: data.tournament_id };
  // First payment on a form nobody has set up yet: list it on Admin > Zeffy.
  await supabase.from("zeffy_campaigns").upsert(
    { campaign_id: payment.campaign_id, title: payment.description, kind: "other" },
    { onConflict: "campaign_id", ignoreDuplicates: true },
  );
  return { kind: "other", title: payment.description, tournament_id: null };
}

type Athlete = { id: string; full_name: string; parent_id: string };

async function recordPayment(supabase: SupabaseClient, payment: Payment): Promise<string> {
  const campaign = await campaignFor(supabase, payment);
  const buyerEmail = (payment.buyer?.email || "").trim().toLowerCase();
  const buyerName = [payment.buyer?.first_name, payment.buyer?.last_name].filter(Boolean).join(" ") ||
    payment.buyer?.company_name || null;
  const currency = (payment.currency || "usd").toLowerCase();
  const paidAt = new Date((payment.created || Date.now() / 1000) * 1000).toISOString();

  // Donations and anything not set up as a program: one row, no athlete.
  if (campaign.kind !== "registration" && campaign.kind !== "tournament" && campaign.kind !== "masters") {
    const { error } = await supabase.from("purchases").insert({
      user_id: null, description: campaign.title, amount_cents: payment.amount, currency, status: "paid",
      zeffy_payment_id: payment.id, zeffy_item_id: null, program_kind: campaign.kind,
      payer_name: buyerName, payer_email: buyerEmail || null, created_at: paidAt,
    });
    if (error && error.code !== "23505") throw error;
    return "recorded";
  }

  // The family: the ECA account with the payer's email.
  let familyAthletes: Athlete[] = [];
  if (buyerEmail) {
    const { data: profile } = await supabase.from("profiles").select("id").ilike("email", likeExact(buyerEmail)).maybeSingle();
    if (profile) {
      const { data } = await supabase.from("athletes").select("id, full_name, parent_id").eq("parent_id", profile.id);
      familyAthletes = data ?? [];
    }
  }

  // One line per athlete: each ticket on a multi-athlete order, otherwise
  // the whole payment (membership/donation-style forms).
  const tickets = (payment.items ?? []).filter((i) => i.type === "ticket");
  const lines = tickets.length
    ? tickets.map((t) => ({ itemId: t.id, amount: t.amount, label: t.rate_title, name: athleteNameFrom(t.questions) ?? athleteNameFrom(payment.buyer_questions) }))
    : [{ itemId: null as string | null, amount: payment.amount, label: null as string | null, name: athleteNameFrom(payment.buyer_questions) }];
  // Masters with no athlete question: the payer is usually the athlete.
  if (campaign.kind === "masters") lines.forEach((l) => { if (!l.name && buyerName) l.name = buyerName; });

  const matched: string[] = [];
  for (const line of lines) {
    const athlete = await matchAthlete(supabase, familyAthletes, line.name, lines.length);
    if (!athlete) {
      const { error } = await supabase.from("zeffy_unmatched").insert({
        zeffy_payment_id: payment.id, zeffy_item_id: line.itemId, campaign_id: payment.campaign_id,
        campaign_title: campaign.title, kind: campaign.kind, typed_name: line.name, buyer_email: buyerEmail || null,
        buyer_name: buyerName, amount_cents: line.amount, currency, paid_at: paidAt,
      });
      if (error && error.code !== "23505") throw error;
      continue;
    }

    const description = `${campaign.title}${line.label ? ` (${line.label})` : ""} — ${athlete.full_name}`;
    const { error } = await supabase.from("purchases").insert({
      user_id: athlete.parent_id, athlete_id: athlete.id,
      tournament_id: campaign.kind === "tournament" ? campaign.tournament_id : null,
      description, amount_cents: line.amount, currency, status: "paid",
      zeffy_payment_id: payment.id, zeffy_item_id: line.itemId, program_kind: campaign.kind,
      payer_name: buyerName, payer_email: buyerEmail || null, created_at: paidAt,
    });
    if (error && error.code !== "23505") throw error;
    if (error) continue; // already recorded on an earlier delivery

    if (campaign.kind === "tournament" && campaign.tournament_id) {
      await supabase.from("tournament_invites")
        .update({ status: "paid", paid_at: new Date().toISOString() })
        .eq("tournament_id", campaign.tournament_id).eq("athlete_id", athlete.id).neq("status", "paid");
    }
    matched.push(athlete.full_name);
  }

  if (matched.length && buyerEmail) {
    await sendEmail(buyerEmail, `You're all set with East County Aquatics`,
      `Thank you! We've got your payment for ${campaign.title}: ${matched.join(", ")}. ` +
      `Your receipt was sent separately by Zeffy.`);
  }
  return matched.length === lines.length ? "recorded" : "recorded; some lines need a look";
}

// Family athlete by name; a family's only athlete when there's no name and
// a single line; else an exact name match club-wide if it's unique (the
// payer used a different email). Anything less certain goes to a person.
async function matchAthlete(supabase: SupabaseClient, family: Athlete[], name: string | null, lineCount: number): Promise<Athlete | null> {
  if (name) {
    const n = normName(name);
    const exact = family.filter((a) => normName(a.full_name) === n);
    if (exact.length === 1) return exact[0];
    // First name only ("Sam") or first + last when the account has a
    // middle name, within the family.
    const loose = family.filter((a) => {
      const full = normName(a.full_name).split(" ");
      const typed = n.split(" ");
      return full[0] === typed[0] && (typed.length === 1 || full[full.length - 1] === typed[typed.length - 1]);
    });
    if (loose.length === 1) return loose[0];

    const { data } = await supabase.from("athletes").select("id, full_name, parent_id").ilike("full_name", likeExact(name.trim()));
    const global = (data ?? []).filter((a) => normName(a.full_name) === n);
    if (global.length === 1) return global[0];
    return null;
  }
  if (lineCount === 1 && family.length === 1) return family[0];
  return null;
}

// payment.updated: a full refund takes the registration away.
async function syncRefund(supabase: SupabaseClient, payment: Payment): Promise<string> {
  if (payment.refund_status !== "full") return "ignored";
  const { error } = await supabase.from("purchases").update({ status: "refunded" })
    .eq("zeffy_payment_id", payment.id).eq("status", "paid");
  if (error) throw error;
  await supabase.from("zeffy_unmatched").delete().eq("zeffy_payment_id", payment.id).is("resolved_at", null);
  return "refunded";
}

async function sendEmail(to: string, subject: string, text: string): Promise<void> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey || !to) return;
  const from = Deno.env.get("RECEIPT_EMAIL_FROM") || "San Diego East County Aquatics <onboarding@resend.dev>";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, text }),
    });
    if (!res.ok) console.error("Resend email failed:", res.status, await res.text());
  } catch (err) {
    console.error("Resend email threw:", err);
  }
}

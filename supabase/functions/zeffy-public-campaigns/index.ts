// Public, no sign-in: the Zeffy forms owners chose to show on the website
// (Admin > Zeffy > "Show on website"), for the cards on the Donate/Sponsor
// and Home pages (js/zeffy-showcase.js). Only safe, public fields leave
// here: title, short description, Zeffy link, banner, dates, and raised vs
// goal for donation forms. Ended events and archived forms are left out.
//
// Deploy: supabase functions deploy zeffy-public-campaigns --no-verify-jwt
// Secrets required: ZEFFY_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// One instance serves many visitors: keep the answer for a few minutes so
// page views don't each call Zeffy.
let cache: { at: number; body: unknown } | null = null;
const CACHE_MS = 5 * 60 * 1000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    if (cache && Date.now() - cache.at < CACHE_MS) return json(cache.body);

    const apiKey = Deno.env.get("ZEFFY_API_KEY");
    if (!apiKey) return json({ campaigns: [] });
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: picked } = await admin.from("zeffy_campaigns").select("campaign_id, site_order").eq("show_on_site", true);
    const rows = (picked ?? []).sort((a, b) => (a.site_order ?? 0) - (b.site_order ?? 0)).slice(0, 12);

    const now = Date.now() / 1000;
    const out = [];
    for (const r of rows) {
      const res = await fetch("https://api.zeffy.com/api/v1/campaigns/" + encodeURIComponent(r.campaign_id), {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) continue;
      const c = await res.json();
      if (c.deleted_at || c.is_archived) continue;
      if (typeof c.url !== "string" || !/^https:\/\/(www\.)?zeffy\.com\//.test(c.url)) continue;
      const occ = Array.isArray(c.occurrences) ? c.occurrences.filter((o: { is_archived?: boolean }) => !o.is_archived) : [];
      const nextOcc = occ.map((o: { start?: number; start_date?: number; end?: number; end_date?: number }) => ({ start: o.start ?? o.start_date, end: o.end ?? o.end_date }))
        .filter((o: { start?: number; end?: number }) => (o.end ?? o.start ?? 0) >= now)
        .sort((a: { start?: number }, b: { start?: number }) => (a.start ?? 0) - (b.start ?? 0))[0];
      const end = nextOcc ? nextOcc.end : c.end_date;
      if (c.type === "ticketing" && end && end < now) continue; // event is over
      out.push({
        id: c.id,
        title: String(c.title || "").slice(0, 140),
        description: plain(c.description).slice(0, 280),
        url: c.url,
        banner_url: typeof c.banner_url === "string" && /^https:\/\//.test(c.banner_url) ? c.banner_url : null,
        type: c.type === "ticketing" ? "event" : "donation",
        start: nextOcc ? nextOcc.start ?? null : c.start_date ?? null,
        end: end ?? null,
        goal_cents: typeof c.goal_amount === "number" ? c.goal_amount : (typeof c.target === "number" ? c.target : null),
        raised_cents: typeof c.volume === "number" ? c.volume : null,
      });
    }
    const body = { campaigns: out };
    cache = { at: Date.now(), body };
    return json(body);
  } catch (err) {
    console.error("zeffy-public-campaigns failed:", err);
    return json({ campaigns: [] });
  }
});

// Zeffy descriptions can be rich text; the cards show a short plain version.
function plain(html: unknown): string {
  return String(html ?? "")
    .replace(/<br\s*\/?>|<\/p>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, " ").trim();
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, max-age=300" },
  });
}

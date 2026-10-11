// Owner-only: lists the club's Zeffy forms (campaigns) for Admin > Zeffy,
// so each can be marked as registration / tournament / Masters / donation.
// Server-side because it needs the Zeffy API key; the browser never sees it.
//
// Deploy: supabase functions deploy zeffy-campaigns
// Secrets required: ZEFFY_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY

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
    if (!authHeader) {
      return json({ error: "Missing Authorization header" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      return json({ error: "Not signed in" }, 401);
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .single();
    if (!profile || profile.role !== "owner") {
      return json({ error: "Owner access required" }, 403);
    }

    const apiKey = Deno.env.get("ZEFFY_API_KEY");
    if (!apiKey) {
      return json({ error: "Zeffy isn't connected yet (ZEFFY_API_KEY is not set)." }, 400);
    }

    // Page through every campaign (100 per page, cursor = last id).
    const campaigns: Array<Record<string, unknown>> = [];
    let after: string | null = null;
    for (let page = 0; page < 20; page++) {
      const url = new URL("https://api.zeffy.com/api/v1/campaigns");
      url.searchParams.set("limit", "100");
      if (after) url.searchParams.set("starting_after", after);
      const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
      if (!res.ok) {
        return json({ error: `Zeffy API error ${res.status}` }, 502);
      }
      const body = await res.json();
      const data = (body.data ?? []) as Array<Record<string, unknown>>;
      campaigns.push(...data);
      if (!body.has_more || !data.length) break;
      after = (body.next_cursor as string) || (data[data.length - 1].id as string);
    }

    return json({
      campaigns: campaigns
        .filter((c) => !c.deleted_at)
        .map((c) => ({ id: c.id, title: c.title, url: c.url, category: c.category, is_archived: c.is_archived })),
    });
  } catch (err) {
    console.error("zeffy-campaigns failed:", err);
    return json({ error: "Could not load Zeffy forms." }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

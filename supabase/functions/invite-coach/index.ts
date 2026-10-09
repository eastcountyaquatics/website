// Owner-only: emails someone an admin just added as a coach. Sent through
// Supabase Auth's own invite email (the same email service that delivers
// sign-up confirmations and password resets), so it works without the
// club's Resend domain being verified.
//
// The invite creates their login right away; handle_new_user applies the
// coach role queued in pending_role_assignments (admin-coaches.html writes
// it before calling this). The email's link opens reset-password.html,
// where they choose a password and then go straight to the Coach
// Registration questionnaire (js/coach-reg-gate.js).
//
// Deploy: supabase functions deploy invite-coach
// Secrets required: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SITE_URL

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

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) return json({ error: "Not signed in" }, 401);

    const { data: profile } = await supabase.from("profiles").select("role").eq("id", userData.user.id).single();
    if (!profile || profile.role !== "owner") return json({ error: "Owner access required" }, 403);

    const body = await req.json();
    const email = String(body.email || "").trim().toLowerCase();
    const coachName = String(body.coach_name || "").trim().slice(0, 200);
    if (!email || !email.includes("@")) return json({ error: "Enter a valid email address" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const siteUrl = Deno.env.get("SITE_URL") ?? "https://eastcountyaquatics.github.io/website";

    const { error } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${siteUrl}/reset-password.html`,
      data: coachName ? { full_name: coachName } : undefined,
    });
    if (error) {
      if (/already been registered|already registered|already exists/i.test(error.message)) {
        return json({ ok: true, emailed: false, already_registered: true, reason: "already has an account" });
      }
      console.error(`Supabase invite failed for ${email}: ${error.message}`);
      return json({ ok: true, emailed: false, reason: error.message });
    }
    return json({ ok: true, emailed: true });
  } catch (err) {
    console.error(err);
    return json({ error: "Something went wrong sending the invite" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

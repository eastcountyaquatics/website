// Owner-only: emails someone an admin just added as a coach, with a direct
// link to create their account. Reuses the same pending_role_assignments
// table admin-users.html already writes to for "assign a role before
// signup" -- this just adds the email on top of that existing mechanism,
// rather than inventing a second one.
//
// Deploy: supabase functions deploy invite-coach
// Secrets required: SUPABASE_URL, SUPABASE_ANON_KEY, SITE_URL
// Optional: RESEND_API_KEY, RECEIPT_EMAIL_FROM -- without it the coach
// record + pending role assignment are still saved, but no email goes out;
// the response says so rather than claiming success.

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

    const apiKey = Deno.env.get("RESEND_API_KEY");
    if (!apiKey) {
      return json({ ok: true, emailed: false, reason: "RESEND_API_KEY is not configured" });
    }

    const siteUrl = Deno.env.get("SITE_URL") ?? "https://eastcountyaquatics.github.io/website";
    const signupUrl = `${siteUrl}/signup.html?email=${encodeURIComponent(email)}`;
    const from = Deno.env.get("RECEIPT_EMAIL_FROM") || "San Diego East County Aquatics <onboarding@resend.dev>";

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: email,
        subject: "You've been added as a coach at San Diego East County Aquatics",
        text:
          `Hi${coachName ? " " + coachName : ""},\n\n` +
          `You've been added as a coach at San Diego East County Aquatics. Create your account here to get access:\n\n${signupUrl}\n\n` +
          `Use this same email address (${email}) when you sign up, so your coach access connects automatically.\n\n` +
          `San Diego East County Aquatics`,
      }),
    });

    if (!res.ok) {
      return json({ ok: true, emailed: false, reason: `Resend responded with ${res.status}` });
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

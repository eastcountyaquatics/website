// Manager-only: permanently delete a login account from Team Access.
// Deleting the auth user cascades through profiles to everything hanging
// off it (athletes, purchases, coach hours/pay, notifications...), so:
//   - action "preview" returns what would go with it, for the confirm box;
//   - action "delete" refuses any account carrying financial history
//     (payments, coach hours, coach pay) -- those are records the club
//     needs to keep for taxes/1099s. Remove that person's access by
//     setting their role to "No admin access" instead.
//   - nobody can delete their own account from here (that's how the last
//     Manager would lock the whole club out).
//
// Deploy: supabase functions deploy delete-user
// Secrets required: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

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

    const callerClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: userData, error: userError } = await callerClient.auth.getUser();
    if (userError || !userData.user) return json({ error: "Not signed in" }, 401);

    const { data: caller } = await callerClient
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .single();
    if (!caller || caller.role !== "owner") {
      return json({ error: "Manager access required" }, 403);
    }

    const body = await req.json();
    const userId = String(body.user_id || "").trim();
    if (!userId) return json({ error: "Missing user_id" }, 400);
    if (userId === userData.user.id) {
      return json({ error: "You can't delete your own account." }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: target } = await admin
      .from("profiles")
      .select("id, email, full_name")
      .eq("id", userId)
      .maybeSingle();
    if (!target) return json({ error: "Account not found." }, 404);

    const count = async (table: string, column: string) => {
      const { count } = await admin
        .from(table)
        .select("*", { count: "exact", head: true })
        .eq(column, userId);
      return count ?? 0;
    };
    const [athletes, purchases, coachHours, coachPayments, mastersSubs] = await Promise.all([
      count("athletes", "parent_id"),
      count("purchases", "user_id"),
      count("coach_hours", "coach_id"),
      count("coach_payments", "coach_id"),
      count("masters_subscriptions", "user_id"),
    ]);
    const linked = { athletes, purchases, coach_hours: coachHours, coach_payments: coachPayments, masters_subscriptions: mastersSubs };
    const blocked = purchases > 0 || coachHours > 0 || coachPayments > 0 || mastersSubs > 0;

    if (body.action === "preview") {
      return json({ ok: true, account: target, linked, blocked });
    }

    if (body.action === "delete") {
      if (blocked) {
        return json({
          error:
            "This account has payment or coach-pay history, which the club needs to keep for its records. " +
            "Set their role to \"No admin access\" instead.",
        }, 409);
      }
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) return json({ error: error.message }, 500);
      // A queued role for the same email would quietly re-grant access if
      // they ever sign up again.
      if (target.email) {
        await admin.from("pending_role_assignments").delete().eq("email", target.email.toLowerCase());
      }
      return json({ ok: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Something went wrong";
    return json({ error: message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

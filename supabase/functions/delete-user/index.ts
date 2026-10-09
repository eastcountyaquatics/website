// Manager-only: permanently delete a login account from Team Access.
// Deleting the auth user cascades through profiles to everything hanging
// off it (athletes, purchases, coach hours/pay, notifications...), so:
//   - action "preview" returns what would go with it, for the confirm box;
//   - action "delete" refuses any account carrying financial history
//     (payments, coach hours, coach pay) -- those are records the club
//     needs to keep for taxes/1099s. Remove that person's access by
//     setting their role to "No admin access" instead.
//   - action "delete" with force: true ("Delete anyway", typed-DELETE
//     confirm on Team Access) goes ahead anyway, first canceling any
//     still-running paid Masters membership in Stripe so billing stops.
//   - every delete first saves the account's records (coach hours, pay,
//     reimbursements, sign-offs, Masters, athletes) to deleted_accounts
//     under the person's name and email, and keeps their purchases,
//     relabeled with that name and email.
//   - nobody can delete their own account from here (that's how the last
//     Manager would lock the whole club out).
//
// Deploy: supabase functions deploy delete-user
// Secrets required: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
// STRIPE_SECRET_KEY (to cancel a running Masters membership on Delete Anyway)

import Stripe from "npm:stripe@^17";
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

    const count = async (table: string, column: string, extra?: (q: any) => any) => {
      let q = admin
        .from(table)
        .select("*", { count: "exact", head: true })
        .eq(column, userId);
      if (extra) q = extra(q);
      const { count } = await q;
      return count ?? 0;
    };
    // Free coach Masters memberships (comped) were never paid for, so they
    // don't count as history worth keeping -- only Stripe-billed ones do.
    const [athletes, purchases, coachHours, coachPayments, mastersSubs] = await Promise.all([
      count("athletes", "parent_id"),
      count("purchases", "user_id"),
      count("coach_hours", "coach_id"),
      count("coach_payments", "coach_id"),
      count("masters_subscriptions", "user_id", (q) => q.eq("comped", false)),
    ]);
    const { count: liveMastersCount } = await admin
      .from("masters_subscriptions")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("comped", false)
      .in("status", ["pending", "active", "paused", "past_due"]);
    const linked = {
      athletes, purchases, coach_hours: coachHours, coach_payments: coachPayments,
      masters_subscriptions: mastersSubs, live_masters: liveMastersCount ?? 0,
    };
    const blocked = purchases > 0 || coachHours > 0 || coachPayments > 0 || mastersSubs > 0;

    if (body.action === "preview") {
      return json({ ok: true, account: target, linked, blocked });
    }

    if (body.action === "delete") {
      const force = body.force === true;
      if (blocked && !force) {
        return json({
          error:
            "This account has payment or coach-pay history, which the club needs to keep for its records. " +
            "Set their role to \"No admin access\" instead.",
        }, 409);
      }
      if (force) {
        // "Delete anyway" (the Manager typed DELETE to confirm). A paid
        // Masters membership that's still running would keep billing their
        // card in Stripe after the account is gone -- cancel it there first.
        // If Stripe can't cancel it, stop: never delete an account that's
        // still being charged.
        const { data: liveSubs } = await admin
          .from("masters_subscriptions")
          .select("id, stripe_subscription_id")
          .eq("user_id", userId)
          .in("status", ["pending", "active", "paused", "past_due"]);
        if (liveSubs && liveSubs.length) {
          const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20" });
          for (const sub of liveSubs) {
            if (sub.stripe_subscription_id) {
              try {
                await stripe.subscriptions.cancel(sub.stripe_subscription_id);
              } catch (err) {
                const already = err instanceof Error && /no such subscription|canceled/i.test(err.message);
                if (!already) {
                  return json({ error: "Could not cancel their Masters membership in Stripe, so nothing was deleted: " + (err instanceof Error ? err.message : String(err)) }, 502);
                }
              }
            }
            await admin.from("masters_subscriptions").update({ status: "canceled" }).eq("id", sub.id);
          }
        }
      }

      // Save everything tied to this login under their name and email
      // before it cascades away (deleted_accounts, shown on Team Access).
      const rowsFor = async (table: string, column: string) => {
        const { data, error } = await admin.from(table).select("*").eq(column, userId);
        if (error) throw new Error(`Could not save ${table}: ${error.message}`);
        return data ?? [];
      };
      const [hours, payments, reimbursements, signoffs, rateHistory, masters, ownAthletes] = await Promise.all([
        rowsFor("coach_hours", "coach_id"),
        rowsFor("coach_payments", "coach_id"),
        rowsFor("coach_reimbursements", "coach_id"),
        rowsFor("coach_hours_signoffs", "coach_id"),
        rowsFor("coach_rate_history", "coach_id"),
        rowsFor("masters_subscriptions", "user_id"),
        rowsFor("athletes", "parent_id"),
      ]);
      const { data: targetRole } = await admin.from("profiles").select("role").eq("id", userId).maybeSingle();
      const { error: logError } = await admin.from("deleted_accounts").insert({
        user_id: userId,
        email: target.email,
        full_name: target.full_name,
        role: targetRole?.role ?? null,
        deleted_by: userData.user.id,
        forced: force && blocked,
        records: {
          coach_hours: hours,
          coach_payments: payments,
          coach_reimbursements: reimbursements,
          coach_hours_signoffs: signoffs,
          coach_rate_history: rateHistory,
          masters_subscriptions: masters,
          athletes: ownAthletes,
        },
      });
      if (logError) return json({ error: "Could not save this account's records, so nothing was deleted: " + logError.message }, 500);

      // Payments stay in the club's records (Sign-Ups, QuickBooks export),
      // relabeled with the person's name and email instead of the login.
      if (purchases > 0) {
        const { data: theirPurchases } = await admin.from("purchases").select("id, payer_name, payer_email").eq("user_id", userId);
        for (const p of theirPurchases ?? []) {
          const { error: detachError } = await admin.from("purchases").update({
            user_id: null,
            payer_name: p.payer_name || target.full_name,
            payer_email: p.payer_email || target.email,
          }).eq("id", p.id);
          if (detachError) return json({ error: "Could not preserve payment records: " + detachError.message }, 500);
        }
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

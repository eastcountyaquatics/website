// Lets a Masters member pause, resume, or cancel their own subscription
// (an owner may also manage any member's on their behalf). Pausing uses
// Stripe's pause_collection so no invoices are generated while paused --
// this is not the same as canceling, and the member keeps their same
// subscription/price when they resume.
//
// Deploy: supabase functions deploy manage-masters-subscription
// Secrets required: STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

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
    const user = userData.user;

    const body = await req.json();
    const action = String(body.action || "");
    if (!["pause", "resume", "cancel"].includes(action)) {
      return json({ error: "action must be 'pause', 'resume', or 'cancel'" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // An owner can pass subscription_id to manage someone else's; a
    // regular member can only ever touch their own.
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    const isOwner = profile?.role === "owner";

    let query = supabase.from("masters_subscriptions").select("*");
    query = body.subscription_id && isOwner ? query.eq("id", body.subscription_id) : query.eq("user_id", user.id);
    const { data: sub, error: subError } = await query.maybeSingle();
    if (subError || !sub) return json({ error: "Masters subscription not found" }, 404);
    if (!sub.stripe_subscription_id) {
      return json({ error: "This membership isn't linked to a Stripe subscription yet" }, 422);
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
      apiVersion: "2024-06-20",
    });

    let stripeSub: Stripe.Subscription;
    if (action === "pause") {
      stripeSub = await stripe.subscriptions.update(sub.stripe_subscription_id, {
        pause_collection: { behavior: "void" },
      });
    } else if (action === "resume") {
      stripeSub = await stripe.subscriptions.update(sub.stripe_subscription_id, {
        pause_collection: null,
      });
    } else {
      stripeSub = await stripe.subscriptions.cancel(sub.stripe_subscription_id);
    }

    // NOTE: this status-mapping logic is duplicated in stripe-webhook,
    // which is the source of truth going forward (Stripe can also change
    // status on its own, e.g. a failed payment). Each Edge Function
    // deploys independently -- keep both copies in sync.
    const status = mapSubscriptionStatus(stripeSub);
    const { error: updateError } = await supabase
      .from("masters_subscriptions")
      .update({
        status,
        current_period_end: stripeSub.current_period_end
          ? new Date(stripeSub.current_period_end * 1000).toISOString()
          : null,
      })
      .eq("id", sub.id);
    if (updateError) return json({ error: updateError.message }, 500);

    return json({ ok: true, status });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Something went wrong";
    return json({ error: message }, 500);
  }
});

function mapSubscriptionStatus(sub: Stripe.Subscription): string {
  if (sub.pause_collection) return "paused";
  if (sub.status === "canceled" || sub.status === "incomplete_expired") return "canceled";
  if (sub.status === "past_due" || sub.status === "unpaid") return "past_due";
  if (sub.status === "active" || sub.status === "trialing") return "active";
  return "pending";
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

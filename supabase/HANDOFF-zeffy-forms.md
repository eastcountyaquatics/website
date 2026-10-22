# Hand-off: Zeffy forms on the website + form picker

**For an agent with access to the ECA Supabase project `kdlkkucvdqmcaujhvrwq`.**
Code: this repo, branch `claude/sd-east-county-aquatics-tv13qz` (latest).


> **Status (Oct 22, 2026): done.** Migration applied: `zeffy_campaigns.show_on_site` (boolean, default false)
> and `site_order` (int, default 0) exist. 1 form is listed and none is ticked "Show on website" yet.
> Deployed zeffy-campaigns v4 (JWT on) and zeffy-public-campaigns v1 (JWT off, new). The step 3 curl
> couldn't run from the deploying sandbox, which has no network access to the project.

1. Apply `supabase/migrations/20261022000000_zeffy_campaigns_on_site.sql`
   (adds `zeffy_campaigns.show_on_site` and `site_order`).
2. Deploy:
   - `zeffy-campaigns` — JWT verification **on** (as now). Now also returns one form's tickets with `{ id }`.
   - `zeffy-public-campaigns` — **new**, JWT verification **off** (`--no-verify-jwt`; it's public and
     returns only forms owners ticked "Show on website"). Uses `ZEFFY_API_KEY`, `SUPABASE_URL`,
     `SUPABASE_SERVICE_ROLE_KEY` (already set).
3. Check: `curl -X POST https://kdlkkucvdqmcaujhvrwq.supabase.co/functions/v1/zeffy-public-campaigns`
   → `{"campaigns":[]}` until an owner ticks a form.

Don't change other RLS, delete data, or touch Stripe.

## Update (Oct 22): redeploy `zeffy-campaigns` again
It now also returns a form's description and dates (for the auto-fill on Admin → Registrations /
Tournaments). JWT verification **on**, as before. No migration.

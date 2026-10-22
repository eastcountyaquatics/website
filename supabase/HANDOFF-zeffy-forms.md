# Hand-off: Zeffy forms on the website + form picker

**For an agent with access to the ECA Supabase project `kdlkkucvdqmcaujhvrwq`.**
Code: this repo, branch `claude/sd-east-county-aquatics-tv13qz` (latest).

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

# Apply: Family Credits database setup

**For an agent/person with write access to the ECA Supabase project (`kdlkkucvdqmcaujhvrwq`).**
The Family Credits admin page (`admin-credits.html`) is already deployed; it shows
"Could not load credits" until these two migrations are applied. Run them **in order**:

1. `supabase/migrations/20261019000000_family_credits.sql`
   Creates `family_credits` and `family_credit_uses` with owner-only RLS.
2. `supabase/migrations/20261019000100_family_credits_seed.sql`
   Imports the 53 credits from the Oct 2026 spreadsheet. Fixed IDs +
   `ON CONFLICT DO NOTHING`, so re-running is harmless.

Both are plain SQL: `apply_migration` (Supabase MCP), `supabase db push`, or paste into the SQL editor.
Requires the existing `public.profiles` table and `public.current_user_role()` (already in the project).

## Verify

```sql
select count(*) as credits,
       sum(amount) as total_credited
from public.family_credits;                       -- expect 53, 4964.55

select (select sum(amount) from public.family_credits)
     - (select coalesce(sum(amount),0) from public.family_credit_uses) as outstanding;
                                                  -- expect 4464.55

select count(*) from public.family_credit_uses;   -- expect 7

select tablename, rowsecurity from pg_tables
where tablename in ('family_credits','family_credit_uses');  -- both true
```

Then sign in as an owner → Admin → Finance → Family Credits: 53 credits, $4,464.55 still owed.

## Notes
- Emily Mouneimne was imported at $95 (sheet said amount $85, balance $95); her row has a "please verify" note.
- Issued entries are dated 2026-10-19 because the sheet had no issue dates.

---

# Apply: Zeffy registration on the club payment form

Zeffy sessions no longer need a Zeffy form each: with the form link left blank on
Admin → Registrations, the site prices each kid (discount codes included) and the
family pays on the club's "Use for Site Prices" form. Two steps:

1. Apply `supabase/migrations/20261020000000_zeffy_registration_club_form.sql`
   (adds `zeffy_registration_codes.discount_code`).
2. Deploy the function: `supabase functions deploy create-zeffy-registration`
   (JWT verification **on**, the default). It now also uses `STRIPE_SECRET_KEY`,
   which the project already has for card checkout.

Also confirm for the Zeffy setup (report back what you find):
- `list_edge_functions` shows `zeffy-webhook` (verify_jwt **false**), `zeffy-campaigns`,
  `create-zeffy-pay-link` (verify_jwt false), `create-zeffy-registration`.
- Secrets exist: `ZEFFY_API_KEY`, `ZEFFY_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY`, `RESEND_API_KEY`.
- `select value from site_settings where key = 'zeffy_paylink_form';` returns the club form.
- Recent `zeffy-webhook` logs (any 401 = webhook secret mismatch).

> **Status (2026-10-20): both items below are DONE.** Nothing here is
> waiting to be applied.
>
> - Family Credits: both migrations applied and verified (53 credits,
>   $4,964.55 credited, 7 issued entries, RLS on). Outstanding is
>   $4,404.55, not $4,464.55: the seed file itself adds up to that (likely
>   a duplicate $60 issued entry for Eisley Schaaff, for the club to check).
> - Zeffy club form: `20261020000000_zeffy_registration_club_form.sql`
>   applied; `create-zeffy-registration` deployed (v2, verify_jwt on).
>   The club form setting points at Zeffy's "test" form.

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

---

# Debug: a $1 Zeffy test payment (Oct 20, ~9:30 PM PT) didn't register

The test athlete "ZZ Zeffy Test Swimmer" paid $1 on https://www.zeffy.com/en-US/ticketing/test-1345
(payer jean.eric.gagnon619@gmail.com). Zeffy says the webhook is configured, but nothing shows on the site.

1. **Deploy** `supabase functions deploy zeffy-webhook --no-verify-jwt` (keep JWT verification **off**).
   The new version logs rejected calls to `webhook_events` so Admin → Zeffy shows them.
2. **Edge logs** for `zeffy-webhook` since 2026-10-20 20:00 PT: was it called at all? Report each call's
   HTTP status. 400 "Invalid signature" = `ZEFFY_WEBHOOK_SECRET` doesn't match Zeffy's signing secret
   (or the `Zeffy-Signature` header format differs — paste one header value, it's not secret).
   500 = handler error (paste the logged error). No calls = Zeffy isn't sending to this URL.
3. **SQL**:
   ```sql
   select received_at, event_type, status, error_message from webhook_events
   where stripe_event_id like 'zeffy:%' order by received_at desc limit 10;
   select created_at, description, amount_cents, status, zeffy_registration_code from purchases
   where zeffy_payment_id is not null order by created_at desc limit 5;
   select * from zeffy_unmatched order by paid_at desc limit 5;
   select code, status, amount_due_cents, paid_cents, option_label from zeffy_registration_codes
   order by created_at desc limit 5;
   ```
4. If the secret is the problem: set `ZEFFY_WEBHOOK_SECRET` to the `whsec_...` value from
   Zeffy → Settings → Integrations → Webhook, then have Zeffy resend the event (or the owner pays $1 again).

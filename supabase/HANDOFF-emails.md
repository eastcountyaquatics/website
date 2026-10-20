# Hand-off: turn on editable emails (Admin → Emails)

**For an agent with access to the ECA Supabase project `kdlkkucvdqmcaujhvrwq`.**
Code: this repo, branch `claude/sd-east-county-aquatics-tv13qz` (latest).

The site's new **Admin → Emails** page lets owners reword every email the site sends. The
page is live, but saved wording only takes effect once these steps are done.

## 1. Apply the migration
`supabase/migrations/20261021000000_email_templates.sql` creates the `email_templates` table
(owner-only RLS).

## 2. Redeploy these 7 functions (latest code). Keep each one's JWT setting as it is now:
| Function | JWT verification |
|---|---|
| `stripe-webhook` | **off** (`--no-verify-jwt`) |
| `zeffy-webhook` | **off** (`--no-verify-jwt`) |
| `send-monthly-hours-signoff` | **off** (`--no-verify-jwt`; it checks the caller itself and is also called by a cron job) |
| `send-tournament-reminder` | on |
| `send-team-announcement-email` | on |
| `send-team-message` | on |
| `send-hosted-event-invites` | on |

Each now reads `email_templates` with the service role and falls back to its built-in wording,
so it keeps working even if step 1 hasn't run.

## 3. Check
```sql
select to_regclass('public.email_templates');         -- not null
select tablename, rowsecurity from pg_tables where tablename = 'email_templates';  -- true
```
Optional end-to-end: an owner edits "Team message" on Admin → Emails, then sends a team
message to a test team; the email's sign-off line should be the edited one.

## Don't
Change RLS on other tables, delete data, or touch Stripe.

## Reminder (separate, still open)
Emails only reach `eastcountyaquatics@gmail.com` until a sending domain is verified in Resend and
`RECEIPT_EMAIL_FROM` is set to an address on it.

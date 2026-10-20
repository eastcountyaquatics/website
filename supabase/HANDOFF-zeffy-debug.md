# Hand-off: why didn't the $1 Zeffy test payment register?

**For an agent with access to the ECA Supabase project `kdlkkucvdqmcaujhvrwq`.**
Code: this repo, branch `claude/sd-east-county-aquatics-tv13qz` (latest).

> **Status (Oct 20, 2026): done, no bug found.** `zeffy-webhook` v8 is deployed (JWT off).
> Zeffy called the webhook at 21:31:20 UTC (`payment.completed`, 200, processed) and 21:32:01 UTC
> (`payment.updated`, 200, ignored). There was no signature error and nothing went to `zeffy_unmatched`. The times
> above are off by the UTC offset: the payment was at about 2:31 PM PT, not 9:30 PM.
> The $1 payment carried the **registration** code `ECA-KCGW6Q` (session "Test"), not tournament code
> `ECA-33HBB7`. It was recorded as paid, and "ZZ Zeffy Test Swimmer" is now active/registered.
> `ECA-33HBB7` is still open and its invite is still pending. To test the tournament path, pay with that code.
> `RESEND_API_KEY` exists, but the payer's confirmation email got a 403 from the Resend sandbox, which only
> sends to eastcountyaquatics@gmail.com until a domain is verified. No data was changed.

## What happened
- Oct 20, ~9:30 PM PT: the owner paid **$1** on the Zeffy form
  https://www.zeffy.com/en-US/ticketing/test-1345 for the test athlete **"ZZ Zeffy Test Swimmer"**.
- Payer email: `jean.eric.gagnon619@gmail.com`. Site payment code: **`ECA-33HBB7`**.
- Zeffy's receipt shows one **"General Admission"** ticket.
- Nothing shows on the site. The owner says the Zeffy webhook is configured.

## Do this, in order

### 1. Deploy the webhook
Deploy `supabase/functions/zeffy-webhook/index.ts` as **`zeffy-webhook`** with **JWT verification OFF**
(`supabase functions deploy zeffy-webhook --no-verify-jwt`). This version logs rejected calls
(bad/missing signature) to `webhook_events` as `zeffy.rejected`, so Admin → Zeffy shows them.

### 2. Check the edge logs
`zeffy-webhook` invocations since **2026-10-21 03:00 UTC** (Oct 20 8 PM PT). Report:
- was it called at all, and each call's HTTP status;
- any logged error text;
- for a 400 "Invalid signature": the `Zeffy-Signature` header value (not secret) — is it `t=…,v1=…`?

### 3. Run this SQL and paste the results
```sql
select received_at, event_type, status, error_message, reference from webhook_events
where stripe_event_id like 'zeffy:%' order by received_at desc limit 10;

select created_at, description, amount_cents, status, program_kind, zeffy_payment_id,
       zeffy_registration_code, payer_email
from purchases where zeffy_payment_id is not null order by created_at desc limit 5;

select paid_at, kind, campaign_title, typed_name, buyer_email, amount_cents
from zeffy_unmatched order by paid_at desc limit 5;

select code, status, amount_due_cents, paid_cents, option_label, registration_option_id
from zeffy_registration_codes order by created_at desc limit 5;

select code, status, amount_due_cents, paid_cents, tournament_invite_id
from zeffy_pay_links order by updated_at desc limit 5;

select value from site_settings where key = 'zeffy_paylink_form';
select campaign_id, title, kind, tournament_id from zeffy_campaigns;
```
Note: `ECA-33HBB7` may be a tournament pay-link code (`zeffy_pay_links`) rather than a
registration code — the owner tested from a tournament invite page. Check both tables.

### 4. Diagnose and fix
| Finding | Cause | Fix |
|---|---|---|
| 400 "Invalid signature" | `ZEFFY_WEBHOOK_SECRET` ≠ Zeffy's signing secret | Ask the owner for the `whsec_…` from Zeffy → Settings → Integrations → Webhook; set it as the `ZEFFY_WEBHOOK_SECRET` secret. If the header format isn't `t=…,v1=…`, report it — `signatureValid()` in the webhook may need changing. |
| 400 "no Zeffy-Signature header" | Zeffy isn't signing, or a proxy strips it | Report the request headers seen in the log. |
| 500 | Handler error | Report the error text and the line if you can find it. |
| No calls at all | Zeffy isn't sending here | Owner checks in Zeffy: URL exactly `https://kdlkkucvdqmcaujhvrwq.supabase.co/functions/v1/zeffy-webhook`, webhook enabled, same Zeffy organization as the form, events `payment.completed`, `payment.updated`, `payment.deleted` ticked. |
| Row in `zeffy_unmatched` | Payment arrived but no code on the ticket | The "General Admission" ticket needs a **required** question "Payment code (from ECA)". The owner can apply this payment by hand: Admin → Zeffy → Needs a Look → Apply Code `ECA-33HBB7`. |
| Row in `purchases` with status `paid` | It worked | Nothing to fix — check the athlete shows as registered/on the roster. |

### 5. Report back
What you found, what you changed, and whether the test athlete now shows as paid/registered.
Also confirm `RESEND_API_KEY` exists (confirmation emails) if your tools can see secrets.

## Don't
Change RLS policies, delete rows, or touch Stripe.

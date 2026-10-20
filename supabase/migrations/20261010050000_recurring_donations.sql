-- NOTE: applied to the database on 2026-10-10, but the Stripe recurring-
-- donation feature it was for was dropped when the club moved donations to
-- Zeffy. These columns are unused (every row is frequency 'once'); kept in
-- the repo so it matches the database.
--
-- Donations can be one-time, monthly or yearly (donate.html), with an
-- optional amount added to cover card fees.
--
--   frequency            'once' | 'month' | 'year'
--   cover_fees_cents     the part of amount_cents the donor added to cover
--                        fees (amount_cents is the full amount charged each
--                        time; all of it is the donation)
--   stripe_subscription_id  the Stripe subscription behind a monthly/yearly
--                        gift, on the first row (and copied onto renewals)
--   recurring_parent_id  a renewal's link back to that first row; each
--                        renewal charge is its own paid row (stripe-webhook,
--                        invoice.paid), so Admin > Sponsorships and receipts
--                        show every gift
--   stripe_invoice_id    the renewal's invoice -- unique, so a repeat webhook
--                        delivery can't record the same charge twice
--   canceled_at          when a monthly/yearly gift was stopped
alter table public.sponsorships
  add column if not exists frequency text not null default 'once'
    check (frequency in ('once', 'month', 'year')),
  add column if not exists cover_fees_cents integer not null default 0
    check (cover_fees_cents >= 0),
  add column if not exists stripe_subscription_id text,
  add column if not exists recurring_parent_id uuid references public.sponsorships(id) on delete set null,
  add column if not exists stripe_invoice_id text,
  add column if not exists canceled_at timestamptz;

create unique index if not exists sponsorships_invoice_dedupe
  on public.sponsorships (stripe_invoice_id) where stripe_invoice_id is not null;
create index if not exists sponsorships_subscription_idx
  on public.sponsorships (stripe_subscription_id) where stripe_subscription_id is not null;

-- The public form may choose how often and whether to cover fees, but the
-- Stripe/renewal bookkeeping columns are only ever set by the server.
alter policy "Anyone can submit a sponsorship inquiry" on public.sponsorships
  with check (
    status = 'pending'
    and stripe_checkout_session_id is null
    and stripe_subscription_id is null
    and recurring_parent_id is null
    and stripe_invoice_id is null
    and canceled_at is null
    and (frequency = 'once' or is_donation)
    and cover_fees_cents <= amount_cents
  );

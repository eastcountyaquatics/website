-- Makes a broken Stripe webhook visible instead of silent.
--
-- The dangerous failure is not an error, it is nothing happening: if Stripe
-- cannot reach the function, or the signing secret is wrong, a family pays,
-- Stripe keeps the money, and the club never learns they are registered.
-- Nobody finds out until someone complains on the pool deck. Every event
-- that arrives is recorded here so the admin panel can answer "are payments
-- still landing?" and "did any of them fail?".
create table if not exists public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  -- Stripe retries; the unique constraint makes a replay a no-op update
  -- rather than a duplicate row.
  stripe_event_id text not null unique,
  event_type text not null,
  received_at timestamptz not null default now(),
  -- processed = we acted on it; ignored = a type we don't handle (normal);
  -- error = it reached us and blew up, which is the one to chase.
  status text not null default 'processed' check (status in ('processed', 'ignored', 'error')),
  error_message text,
  -- Enough to find the payment in Stripe without storing card data.
  reference text
);

create index if not exists webhook_events_recent_idx
  on public.webhook_events (received_at desc);
create index if not exists webhook_events_status_idx
  on public.webhook_events (status, received_at desc);

alter table public.webhook_events enable row level security;

-- Read-only, and only for the people who chase money. The Edge Function
-- writes with the service role, which bypasses RLS, so there is deliberately
-- no insert/update policy here at all.
create policy "Owners read webhook events"
  on public.webhook_events for select
  to authenticated
  using (public.current_user_role() in ('owner', 'accountant'));

-- Zeffy as the payment processor. Families pay on Zeffy-hosted forms; the
-- zeffy-webhook Edge Function records each payment into purchases and ties
-- it to the athlete (family by payer email, athlete by the name typed on
-- the form). Anything it can't tie to an athlete lands in zeffy_unmatched
-- for the Manager to assign on Admin > Zeffy.

-- What each Zeffy form is for. The webhook adds a form it hasn't seen as
-- 'other'; the Manager sets the real kind on Admin > Zeffy.
create table if not exists public.zeffy_campaigns (
  campaign_id text primary key,
  title text,
  kind text not null default 'other'
    check (kind in ('registration', 'tournament', 'masters', 'donation', 'other')),
  tournament_id uuid references public.tournaments(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.zeffy_campaigns enable row level security;

create policy "Owners manage zeffy campaigns"
  on public.zeffy_campaigns for all
  to authenticated
  using (public.current_user_role() = 'owner')
  with check (public.current_user_role() = 'owner');

-- Zeffy payments live in purchases next to the Stripe ones, so Sign-Ups,
-- exports and My Account keep working from one table.
alter table public.purchases add column if not exists zeffy_payment_id text;
alter table public.purchases add column if not exists zeffy_item_id text;
alter table public.purchases add column if not exists program_kind text;

-- One purchases row per Zeffy payment line (one per athlete on a
-- multi-athlete order); a repeat webhook delivery is a no-op.
create unique index if not exists purchases_zeffy_dedupe
  on public.purchases (zeffy_payment_id, coalesce(zeffy_item_id, ''))
  where zeffy_payment_id is not null;

-- Payment lines that need a person to say which athlete they're for.
create table if not exists public.zeffy_unmatched (
  id uuid primary key default gen_random_uuid(),
  zeffy_payment_id text not null,
  zeffy_item_id text,
  campaign_id text,
  campaign_title text,
  kind text not null,
  typed_name text,
  buyer_email text,
  buyer_name text,
  amount_cents integer not null default 0,
  currency text not null default 'usd',
  paid_at timestamptz not null default now(),
  resolved_athlete_id uuid references public.athletes(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists zeffy_unmatched_line
  on public.zeffy_unmatched (zeffy_payment_id, coalesce(zeffy_item_id, ''));

alter table public.zeffy_unmatched enable row level security;

create policy "Owners view zeffy unmatched"
  on public.zeffy_unmatched for select
  to authenticated
  using (public.current_user_role() = 'owner');

-- Assign an unmatched line to an athlete: records the purchase exactly as
-- the webhook would have, then marks the line resolved.
create or replace function public.resolve_zeffy_unmatched(p_id uuid, p_athlete_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  u record;
  a record;
  tid uuid;
begin
  if public.current_user_role() is distinct from 'owner' then
    raise exception 'Only the club manager can assign payments.';
  end if;
  select * into u from public.zeffy_unmatched where id = p_id for update;
  if not found then raise exception 'Payment line not found.'; end if;
  if u.resolved_at is not null then raise exception 'This payment is already assigned.'; end if;
  select id, full_name, parent_id into a from public.athletes where id = p_athlete_id;
  if not found then raise exception 'Athlete not found.'; end if;
  select tournament_id into tid from public.zeffy_campaigns where campaign_id = u.campaign_id;

  insert into public.purchases (user_id, athlete_id, tournament_id, description, amount_cents, currency,
                                status, zeffy_payment_id, zeffy_item_id, program_kind, payer_name, payer_email, created_at)
  values (a.parent_id, a.id, case when u.kind = 'tournament' then tid end,
          coalesce(u.campaign_title, 'Zeffy payment') || ' — ' || a.full_name,
          u.amount_cents, u.currency, 'paid', u.zeffy_payment_id, u.zeffy_item_id, u.kind,
          u.buyer_name, u.buyer_email, u.paid_at)
  on conflict do nothing;

  if u.kind = 'tournament' and tid is not null then
    update public.tournament_invites set status = 'paid', paid_at = now()
      where tournament_id = tid and athlete_id = a.id and status <> 'paid';
  end if;

  update public.zeffy_unmatched set resolved_athlete_id = a.id, resolved_at = now() where id = p_id;
end;
$$;

revoke all on function public.resolve_zeffy_unmatched(uuid, uuid) from public, anon;
grant execute on function public.resolve_zeffy_unmatched(uuid, uuid) to authenticated;

-- Registered = also a Zeffy session registration (same 6-month window as a
-- Stripe one) or a Zeffy Masters payment in the last 35 days (monthly
-- membership; a lapsed or canceled one stops renewing and drops off).
create or replace function public.athlete_is_active(p_athlete_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
      select 1 from public.purchases
      where athlete_id = p_athlete_id and status = 'paid' and registration_option_id is not null
        and created_at > now() - interval '6 months')
    or exists (
      select 1 from public.purchases
      where athlete_id = p_athlete_id and status = 'paid' and program_kind = 'registration'
        and created_at > now() - interval '6 months')
    or exists (
      select 1 from public.purchases
      where athlete_id = p_athlete_id and status = 'paid' and program_kind = 'masters'
        and created_at > now() - interval '35 days')
    or exists (
      select 1 from public.athletes
      where id = p_athlete_id and trial_expires_on >= (now() at time zone 'America/Los_Angeles')::date)
    or exists (
      select 1 from public.masters_subscriptions
      where athlete_id = p_athlete_id and status in ('pending', 'active', 'paused', 'past_due'));
$$;

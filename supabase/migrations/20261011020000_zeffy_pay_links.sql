-- Zeffy pay links: the site sets the price, Zeffy only collects it.
--
-- A tournament can be switched to Zeffy (payment_provider = 'zeffy'). Its
-- invite page then works out the family's price exactly as the Stripe
-- checkout would (tier + the club's discount codes) and hands them a code
-- to paste into one generic, pay-what-you-want Zeffy form. zeffy-webhook
-- reads the code back off the payment, checks the amount against what was
-- owed and marks the invite paid -- or emails the family the balance.
-- Stripe tournaments are untouched.

alter table public.tournaments add column if not exists payment_provider text not null default 'stripe';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tournaments_payment_provider_check') then
    alter table public.tournaments add constraint tournaments_payment_provider_check
      check (payment_provider in ('stripe', 'zeffy'));
  end if;
end $$;

-- The generic form is chosen on Admin > Zeffy and kept in site_settings
-- under 'zeffy_paylink_form' as {campaign_id, url, title}.

-- One code per invite. amount_due_cents is re-priced each time the family
-- asks for their code (a discount code can change it) until it's paid.
create table if not exists public.zeffy_pay_links (
  code text primary key,
  tournament_invite_id uuid not null unique references public.tournament_invites(id) on delete cascade,
  amount_due_cents integer not null check (amount_due_cents >= 0),
  currency text not null default 'usd',
  tier_label text,
  discount_code text,
  payer_name text,
  payer_email text,
  shirt_size text,
  status text not null default 'open' check (status in ('open', 'short', 'paid')),
  paid_cents integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.zeffy_pay_links enable row level security;

create policy "Owners view zeffy pay links"
  on public.zeffy_pay_links for select
  to authenticated
  using (public.current_user_role() = 'owner');

-- Lines on the pay-link form whose code didn't match land in
-- zeffy_unmatched as kind 'paylink' (Admin > Zeffy asks for the right code).

-- Re-adds up every Zeffy payment recorded against an invite and sets the
-- invite and its pay link from the total: paid in full -> invite paid,
-- something but not enough -> 'short', nothing left (all refunded) -> back
-- to pending. Called after any change, so it's always derived, never
-- incremented, and safe to run twice.
create or replace function public.zeffy_settle_invite(p_invite_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  l record;
  paid integer;
  new_status text;
begin
  select * into l from public.zeffy_pay_links where tournament_invite_id = p_invite_id for update;
  if not found then return null; end if;

  select coalesce(sum(amount_cents), 0)::integer into paid
  from public.purchases
  where tournament_invite_id = p_invite_id and status = 'paid' and zeffy_payment_id is not null;

  new_status := case when paid >= l.amount_due_cents and paid > 0 then 'paid'
                     when paid > 0 then 'short'
                     else 'open' end;

  update public.zeffy_pay_links
    set paid_cents = paid, status = new_status, updated_at = now()
    where code = l.code;

  if new_status = 'paid' then
    update public.tournament_invites set status = 'paid', paid_at = coalesce(paid_at, now())
      where id = p_invite_id and status <> 'paid';
  else
    -- Only undo a paid invite this mechanism paid (no Stripe purchase on it).
    update public.tournament_invites set status = 'pending', paid_at = null
      where id = p_invite_id and status = 'paid'
        and not exists (select 1 from public.purchases
                        where tournament_invite_id = p_invite_id and status = 'paid'
                          and stripe_checkout_session_id is not null);
  end if;

  return jsonb_build_object('status', new_status, 'paid_cents', paid, 'due_cents', l.amount_due_cents,
                            'code', l.code, 'payer_email', l.payer_email);
end;
$$;

revoke all on function public.zeffy_settle_invite(uuid) from public, anon, authenticated;

-- Records one Zeffy payment against a pay-link code, then settles the
-- invite. Returns null when the code isn't a known pay link. A repeat
-- delivery of the same payment is a no-op (purchases_zeffy_dedupe).
create or replace function public.apply_zeffy_pay_link(
  p_code text, p_payment_id text, p_amount_cents integer, p_currency text,
  p_buyer_name text, p_buyer_email text, p_paid_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  l record;
  inv record;
  t record;
  a record;
  result jsonb;
begin
  select * into l from public.zeffy_pay_links where code = p_code;
  if not found then return null; end if;
  select * into inv from public.tournament_invites where id = l.tournament_invite_id;
  select name into t from public.tournaments where id = inv.tournament_id;
  select full_name into a from public.athletes where id = inv.athlete_id;

  insert into public.purchases (user_id, athlete_id, tournament_id, tournament_invite_id, description,
                                amount_cents, currency, status, zeffy_payment_id, zeffy_item_id,
                                program_kind, payer_name, payer_email, created_at)
  values (null, inv.athlete_id, inv.tournament_id, inv.id,
          coalesce(t.name, 'Tournament') || ' — ' || coalesce(a.full_name, 'Athlete') ||
            coalesce(' (' || l.tier_label || ')', ''),
          p_amount_cents, coalesce(p_currency, 'usd'), 'paid', p_payment_id, null,
          'tournament', coalesce(l.payer_name, p_buyer_name), coalesce(l.payer_email, p_buyer_email),
          coalesce(p_paid_at, now()))
  on conflict do nothing;

  result := public.zeffy_settle_invite(inv.id);
  return result || jsonb_build_object('tournament_name', t.name, 'athlete_name', a.full_name);
end;
$$;

revoke all on function public.apply_zeffy_pay_link(text, text, integer, text, text, text, timestamptz) from public, anon, authenticated;

-- Admin > Zeffy: a pay-link payment whose code was mistyped. The Manager
-- types the right code and it's applied exactly as the webhook would have.
create or replace function public.resolve_zeffy_unmatched_code(p_id uuid, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  u record;
  result jsonb;
  clean text;
begin
  if public.current_user_role() is distinct from 'owner' then
    raise exception 'Only the club manager can assign payments.';
  end if;
  select * into u from public.zeffy_unmatched where id = p_id for update;
  if not found then raise exception 'Payment line not found.'; end if;
  if u.resolved_at is not null then raise exception 'This payment is already assigned.'; end if;

  clean := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  if clean like 'ECA%' then clean := substr(clean, 4); end if;
  clean := 'ECA-' || clean;

  result := public.apply_zeffy_pay_link(clean, u.zeffy_payment_id, u.amount_cents, u.currency,
                                        u.buyer_name, u.buyer_email, u.paid_at);
  if result is null then raise exception 'No payment code % on file.', clean; end if;

  update public.zeffy_unmatched
    set resolved_at = now(),
        resolved_athlete_id = (select athlete_id from public.tournament_invites i
                               join public.zeffy_pay_links l on l.tournament_invite_id = i.id
                               where l.code = clean)
    where id = p_id;
  return result;
end;
$$;

revoke all on function public.resolve_zeffy_unmatched_code(uuid, text) from public, anon;
grant execute on function public.resolve_zeffy_unmatched_code(uuid, text) to authenticated;

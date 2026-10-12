-- Registration on Zeffy: a Zeffy form per registration option (session)
-- with a set-price ticket, and one payment code per kid per session.
--
-- On My Account a family still picks the session and kids and agrees to
-- the consent, then gets one code per kid. They pick the ticket on that
-- session's Zeffy form and paste each kid's code on that kid's ticket. The
-- code is one-to-one with (athlete, registration option): code is the
-- primary key and (athlete_id, registration_option_id) is unique.

alter table public.registration_options add column if not exists payment_provider text not null default 'stripe';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'registration_options_payment_provider_check') then
    alter table public.registration_options add constraint registration_options_payment_provider_check
      check (payment_provider in ('stripe', 'zeffy'));
  end if;
end $$;
alter table public.registration_options add column if not exists zeffy_form_url text;

create table if not exists public.zeffy_registration_codes (
  code text primary key,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  registration_option_id uuid not null references public.registration_options(id) on delete cascade,
  user_id uuid not null,
  option_label text,
  amount_due_cents integer not null check (amount_due_cents >= 0),
  currency text not null default 'usd',
  consent jsonb,
  status text not null default 'open' check (status in ('open', 'short', 'paid')),
  paid_cents integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (athlete_id, registration_option_id)
);

alter table public.zeffy_registration_codes enable row level security;

create policy "Parents view their registration codes"
  on public.zeffy_registration_codes for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "Owners view registration codes"
  on public.zeffy_registration_codes for select
  to authenticated
  using (public.current_user_role() = 'owner');

-- Which code a Zeffy payment line was applied to (registration payments).
alter table public.purchases add column if not exists zeffy_registration_code text;
create index if not exists purchases_zeffy_registration_code_idx
  on public.purchases (zeffy_registration_code) where zeffy_registration_code is not null;

-- Status from the Zeffy payments recorded against a code, derived every
-- time so it is safe to run twice: paid in full (or with a Zeffy discount)
-- -> every row 'paid' and the athlete is registered; less -> 'short' and
-- the rows stay 'pending' (a partial payment never registers a kid);
-- nothing left (all refunded) -> 'open'.
create or replace function public.zeffy_settle_registration(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
  paid integer;
  discounted boolean;
  new_status text;
begin
  select * into c from public.zeffy_registration_codes where code = p_code for update;
  if not found then return null; end if;

  select coalesce(sum(amount_cents), 0)::integer, coalesce(bool_or(zeffy_discount_code is not null), false)
    into paid, discounted
  from public.purchases
  where zeffy_registration_code = p_code and status in ('pending', 'paid') and zeffy_payment_id is not null;

  new_status := case when paid > 0 and (paid >= c.amount_due_cents or discounted) then 'paid'
                     when paid > 0 then 'short'
                     else 'open' end;

  update public.zeffy_registration_codes
    set paid_cents = paid, status = new_status, updated_at = now()
    where code = p_code;

  update public.purchases
    set status = case when new_status = 'paid' then 'paid' else 'pending' end
    where zeffy_registration_code = p_code and status in ('pending', 'paid') and zeffy_payment_id is not null;

  return jsonb_build_object('status', new_status, 'paid_cents', paid, 'due_cents', c.amount_due_cents,
                            'code', c.code, 'kind', 'registration');
end;
$$;

revoke all on function public.zeffy_settle_registration(text) from public, anon, authenticated;

-- One Zeffy payment line (a ticket, or the whole payment) against a
-- registration code, on the family's account and the kid, with the
-- consent they agreed to. Null when the code isn't a registration code. A
-- repeat delivery of the same line is a no-op (purchases_zeffy_dedupe).
create or replace function public.apply_zeffy_registration_code(
  p_code text, p_payment_id text, p_item_id text, p_amount_cents integer, p_currency text,
  p_buyer_name text, p_buyer_email text, p_paid_at timestamptz, p_discount_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
  a record;
  result jsonb;
begin
  select * into c from public.zeffy_registration_codes where code = p_code;
  if not found then return null; end if;
  select full_name into a from public.athletes where id = c.athlete_id;

  insert into public.purchases (user_id, athlete_id, registration_option_id, description,
                                amount_cents, currency, status, zeffy_payment_id, zeffy_item_id,
                                program_kind, payer_name, payer_email, zeffy_discount_code,
                                consent_responses, zeffy_registration_code, created_at)
  values (c.user_id, c.athlete_id, c.registration_option_id,
          coalesce(c.option_label, 'Registration') || ' — ' || coalesce(a.full_name, 'Athlete'),
          p_amount_cents, coalesce(p_currency, 'usd'), 'pending', p_payment_id, p_item_id,
          'registration', p_buyer_name, p_buyer_email, nullif(p_discount_code, ''),
          c.consent, p_code, coalesce(p_paid_at, now()))
  on conflict do nothing;

  result := public.zeffy_settle_registration(p_code);
  return result || jsonb_build_object('tournament_name', c.option_label, 'athlete_name', a.full_name,
                                      'payer_email', p_buyer_email);
end;
$$;

revoke all on function public.apply_zeffy_registration_code(text, text, text, integer, text, text, text, timestamptz, text) from public, anon, authenticated;

-- Admin > Zeffy "Apply Code" for a mistyped code: tournament codes first,
-- then registration codes, for that one line.
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
  athlete uuid;
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

  result := public.apply_zeffy_pay_code(clean, u.zeffy_payment_id, u.zeffy_item_id, u.amount_cents, u.currency,
                                        u.buyer_name, u.buyer_email, u.paid_at, null);
  if result is not null then
    select i.athlete_id into athlete from public.tournament_invites i
      join public.zeffy_pay_links l on l.tournament_invite_id = i.id where l.code = clean;
  else
    result := public.apply_zeffy_registration_code(clean, u.zeffy_payment_id, u.zeffy_item_id, u.amount_cents,
                                                   u.currency, u.buyer_name, u.buyer_email, u.paid_at, null);
    if result is null then raise exception 'No payment code % on file.', clean; end if;
    select athlete_id into athlete from public.zeffy_registration_codes where code = clean;
  end if;

  update public.zeffy_unmatched set resolved_at = now(), resolved_athlete_id = athlete where id = p_id;
  return result;
end;
$$;

revoke all on function public.resolve_zeffy_unmatched_code(uuid, text) from public, anon;
grant execute on function public.resolve_zeffy_unmatched_code(uuid, text) to authenticated;

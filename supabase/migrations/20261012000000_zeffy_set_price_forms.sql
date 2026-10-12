-- Set-price Zeffy forms, one code per player.
--
-- Each tournament can have its own Zeffy form (zeffy_form_url) with a
-- ticket per price. The family taps Pay on the invite, copies their code,
-- picks their ticket on that form and pastes the code on it. The code is
-- one-to-one with the player's invite (zeffy_pay_links: code primary key,
-- tournament_invite_id unique), and each ticket on an order carries its
-- own code -- so a two-kid order credits each kid separately.

alter table public.tournaments add column if not exists zeffy_form_url text;

-- A Zeffy discount code used on the payment. With set prices, discounts
-- live in Zeffy, so a discounted ticket counts as paid in full.
alter table public.purchases add column if not exists zeffy_discount_code text;

-- Invite status from the Zeffy payments recorded against it: paid in full
-- (or with a Zeffy discount) -> paid; something but less -> short; nothing
-- left -> open. Derived every time, so safe to run twice.
create or replace function public.zeffy_settle_invite(p_invite_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  l record;
  paid integer;
  discounted boolean;
  new_status text;
begin
  select * into l from public.zeffy_pay_links where tournament_invite_id = p_invite_id for update;
  if not found then return null; end if;

  select coalesce(sum(amount_cents), 0)::integer, coalesce(bool_or(zeffy_discount_code is not null), false)
    into paid, discounted
  from public.purchases
  where tournament_invite_id = p_invite_id and status = 'paid' and zeffy_payment_id is not null;

  new_status := case when paid > 0 and (paid >= l.amount_due_cents or discounted) then 'paid'
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

-- Records one Zeffy payment line (a ticket, or the whole payment) against a
-- code, on the family's account (the athlete's parent) and the athlete,
-- then settles the invite. Null when the code isn't on file. A repeat
-- delivery of the same line is a no-op (purchases_zeffy_dedupe).
create or replace function public.apply_zeffy_pay_code(
  p_code text, p_payment_id text, p_item_id text, p_amount_cents integer, p_currency text,
  p_buyer_name text, p_buyer_email text, p_paid_at timestamptz, p_discount_code text)
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
  select full_name, parent_id into a from public.athletes where id = inv.athlete_id;

  insert into public.purchases (user_id, athlete_id, tournament_id, tournament_invite_id, description,
                                amount_cents, currency, status, zeffy_payment_id, zeffy_item_id,
                                program_kind, payer_name, payer_email, zeffy_discount_code, created_at)
  values (a.parent_id, inv.athlete_id, inv.tournament_id, inv.id,
          coalesce(t.name, 'Tournament') || ' — ' || coalesce(a.full_name, 'Athlete') ||
            coalesce(' (' || l.tier_label || ')', ''),
          p_amount_cents, coalesce(p_currency, 'usd'), 'paid', p_payment_id, p_item_id,
          'tournament', coalesce(l.payer_name, p_buyer_name), coalesce(l.payer_email, p_buyer_email),
          nullif(p_discount_code, ''), coalesce(p_paid_at, now()))
  on conflict do nothing;

  result := public.zeffy_settle_invite(inv.id);
  return result || jsonb_build_object('tournament_name', t.name, 'athlete_name', a.full_name);
end;
$$;

revoke all on function public.apply_zeffy_pay_code(text, text, text, integer, text, text, text, timestamptz, text) from public, anon, authenticated;

-- Admin > Zeffy "Apply Code" for a mistyped code: same as the webhook,
-- for that one line.
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

  result := public.apply_zeffy_pay_code(clean, u.zeffy_payment_id, u.zeffy_item_id, u.amount_cents, u.currency,
                                        u.buyer_name, u.buyer_email, u.paid_at, null);
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

-- A parent could destroy a paid tournament entry with one click.
--
-- dashboard.html offers "Remove this athlete from your account". Deleting an
-- athlete cascades to tournament_invites and tournament_rsvps, so an athlete
-- who had already PAID for a tournament was removed from the coach's roster
-- with no trace, days before the event, and nobody was told. The purchases
-- row survived (athlete_id is SET NULL) but was left pointing at a deleted
-- invite with no athlete attached -- money on the books that can no longer
-- be tied to a person. Verified against this database before writing the fix.
--
-- Owners keep the escape hatch: a purchase still carries payer_name and a
-- description naming the athlete, so a deliberate admin deletion stays
-- traceable in the exports. It is the self-service parent path that must not
-- silently undo a payment.
create or replace function public.block_delete_paid_athlete()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  paid_purchases int;
  paid_invites int;
begin
  -- auth.uid() is null for the service role and direct SQL (trusted).
  if auth.uid() is null or public.current_user_role() = 'owner' then
    return old;
  end if;

  select count(*) into paid_purchases
    from public.purchases where athlete_id = old.id and status = 'paid';
  select count(*) into paid_invites
    from public.tournament_invites where athlete_id = old.id and status = 'paid';

  if paid_purchases > 0 or paid_invites > 0 then
    raise exception 'This athlete has payments on file, so removing them would undo a paid registration or tournament entry. Contact the club and we will sort it out.';
  end if;

  return old;
end;
$$;

revoke execute on function public.block_delete_paid_athlete() from public, anon, authenticated;

create trigger athletes_block_delete_when_paid
  before delete on public.athletes
  for each row execute function public.block_delete_paid_athlete();

-- Advisor: these two policies re-evaluated auth.uid() per row. Wrapping it in
-- a scalar subquery makes Postgres evaluate it once for the whole query.
drop policy if exists "Coaches read messages addressed to them" on public.contact_messages;
create policy "Coaches read messages addressed to them"
  on public.contact_messages for select
  to authenticated
  using (exists (
    select 1 from public.coaches c
    where c.id = contact_messages.recipient_coach_id
      and c.profile_id = (select auth.uid())
  ));

drop policy if exists "Coaches update messages addressed to them" on public.contact_messages;
create policy "Coaches update messages addressed to them"
  on public.contact_messages for update
  to authenticated
  using (exists (
    select 1 from public.coaches c
    where c.id = contact_messages.recipient_coach_id
      and c.profile_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.coaches c
    where c.id = contact_messages.recipient_coach_id
      and c.profile_id = (select auth.uid())
  ));

-- Advisor: foreign key with no covering index.
create index if not exists attendance_recorded_by_idx
  on public.attendance (recorded_by);

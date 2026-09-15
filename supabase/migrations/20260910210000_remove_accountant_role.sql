-- Drop the 'accountant' role entirely -- confirmed zero rows in profiles
-- or pending_role_assignments use it, so this is a pure schema change with
-- no data to migrate. The person who filled that need becomes an owner
-- instead.
alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('owner', 'coach'));

alter table public.pending_role_assignments drop constraint pending_role_assignments_role_check;
alter table public.pending_role_assignments add constraint pending_role_assignments_role_check
  check (role in ('owner', 'coach'));

drop policy "Accountants can view all purchases" on public.purchases;
drop policy "Accountants can view all profiles" on public.profiles;

alter policy "Owners read webhook events" on public.webhook_events
  using (public.current_user_role() = 'owner');

alter policy "Owners and accountants can view all masters subscriptions" on public.masters_subscriptions
  using (public.current_user_role() = 'owner');

alter policy "Owners and accountants manage sponsorships" on public.sponsorships
  using (public.current_user_role() = 'owner')
  with check (public.current_user_role() = 'owner');

create or replace function public.guard_sponsorship_update()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null or public.current_user_role() = 'owner' then
    return new;
  end if;
  raise exception 'Sponsorship submissions cannot be edited after they are sent';
end;
$$;

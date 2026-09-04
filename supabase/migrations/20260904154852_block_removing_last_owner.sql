-- Stop the club from locking itself out of its own admin panel.
--
-- admin-users.html offers "No admin access" in the role dropdown for every
-- account, including the row belonging to the signed-in owner. There is
-- currently exactly one owner, so a single mis-click demotes them,
-- current_user_role() returns null, requireRole(["owner"]) bounces them to
-- the dashboard, and every admin page -- roster, payments, schedules,
-- content -- becomes permanently unreachable. Nothing in the app can undo
-- it; recovery requires direct database access.
--
-- The UI guard added alongside this is a courtesy. This trigger is the
-- actual protection, because the role dropdown talks to PostgREST with the
-- publishable key that ships in the site's JS -- an owner can issue the
-- same UPDATE by hand.
create or replace function public.enforce_last_owner()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- Only care when an owner stops being one, by demotion or deletion.
  if tg_op = 'UPDATE' and (old.role is distinct from 'owner' or new.role = 'owner') then
    return new;
  end if;
  if tg_op = 'DELETE' and old.role is distinct from 'owner' then
    return old;
  end if;

  if (select count(*) from public.profiles where role = 'owner') <= 1 then
    raise exception 'This is the club''s only owner account. Make someone else an owner first, or the admin panel becomes unreachable.';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke execute on function public.enforce_last_owner() from public, anon, authenticated;

create trigger profiles_enforce_last_owner_update
  before update on public.profiles
  for each row execute function public.enforce_last_owner();

create trigger profiles_enforce_last_owner_delete
  before delete on public.profiles
  for each row execute function public.enforce_last_owner();

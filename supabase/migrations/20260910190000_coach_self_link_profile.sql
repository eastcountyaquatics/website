-- Let a coach who has already been given the 'coach' role (via the existing
-- pending_role_assignments / admin-users.html invite flow) self-claim their
-- own bio row on the coaches page, instead of requiring the owner to do it
-- one-by-one from the Account dropdown on admin-coaches.html.
--
-- RLS on coaches already lets any authenticated coach UPDATE any row (that's
-- intentional -- coaches can edit each other's bios). Without a guard, that
-- same broad policy would also let a coach point ANY coach row's profile_id
-- at ANY account, including hijacking a link someone else already holds.
-- This trigger narrows profile_id specifically: an owner can set it to
-- anything (unchanged); a coach may only move it from null -> their own
-- uid (claiming an unclaimed bio as themselves) or from their own uid ->
-- null (undoing their own claim). Every other column stays freely editable
-- by any coach, matching the existing behavior.
create or replace function public.guard_coach_profile_link()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if public.current_user_role() = 'owner' then
    return new;
  end if;

  if new.profile_id is not distinct from old.profile_id then
    return new;
  end if;

  if old.profile_id is null and new.profile_id = auth.uid() then
    return new;
  end if;

  if old.profile_id = auth.uid() and new.profile_id is null then
    return new;
  end if;

  raise exception 'You can only link or unlink your own account.';
end;
$$;

revoke execute on function public.guard_coach_profile_link() from public, anon, authenticated;

drop trigger if exists coaches_guard_profile_link on public.coaches;
create trigger coaches_guard_profile_link
  before update on public.coaches
  for each row execute function public.guard_coach_profile_link();

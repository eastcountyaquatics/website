-- "Parents manage their own athletes" is an ALL policy keyed only on
-- auth.uid() = parent_id -- RLS is row-level, so it does not stop a parent
-- from writing (or reading) every column on their own athlete row via a
-- direct Supabase client call, UI aside. Two columns need a stricter
-- boundary than the UI alone provides:
--
-- - team_slug: which team an athlete is placed on is a staff decision, not
--   something a parent should be able to change by calling
--   supabaseClient.from("athletes").update({ team_slug: ... }) directly.
-- - coach_notes: added specifically to be separate from the parent-facing
--   notes field ("kept separate ... so a coach's observations don't
--   overwrite them" -- see 20260902173507). A parent reading it back over
--   the same channel defeats the point of it being staff-only.
--
-- The write side is a plain row-level check, so a trigger (same pattern as
-- enforce_profile_role_change on profiles) is enough. The read side needs
-- an actual column-level restriction, which RLS can't express -- coaches
-- and parents share the single "authenticated" Postgres role, so a coach
-- and a parent are indistinguishable to a table-level GRANT. Revoking
-- column SELECT and routing the one legitimate reader (admin-athletes.html)
-- through a SECURITY DEFINER function is what actually enforces it.

create or replace function public.enforce_athlete_staff_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.team_slug is distinct from old.team_slug or new.coach_notes is distinct from old.coach_notes)
     and auth.uid() is not null
     and current_user_role() not in ('owner', 'coach') then
    raise exception 'Only staff can change team assignment or coach notes';
  end if;
  return new;
end;
$$;

create trigger athletes_enforce_staff_fields
  before update on public.athletes
  for each row
  execute function public.enforce_athlete_staff_fields();

revoke select (coach_notes) on public.athletes from authenticated, anon;

create or replace function public.list_athletes_for_staff()
returns setof public.athletes
language sql
stable
security definer
set search_path = public
as $$
  select * from public.athletes
  where current_user_role() in ('owner', 'coach');
$$;

grant execute on function public.list_athletes_for_staff() to authenticated;

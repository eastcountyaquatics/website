-- Fixes a real bug: Attendance -> Log Hours only offered coaches whose
-- `coaches` bio row had been manually linked (profile_id set) to their
-- account -- a newly self-registered or admin-added coach with
-- profiles.role = 'coach' but no linked bio row (or no bio row at all)
-- never showed up there, because the picker queried the public "About Us"
-- `coaches` table instead of who actually has coach access.
--
-- `coaches` is a separate, optional public-bio concept; `profiles.role`
-- is the real access-control source of truth. The picker should always
-- reflect the latter, automatically, with no manual list to maintain.
--
-- profiles' own RLS only lets a coach read their OWN row ("Users can view
-- own profile"), so a coach can't just select profiles directly to build
-- this roster -- same class of problem list_athletes_for_staff already
-- solves for the athlete roster. Same fix here: a narrow SECURITY DEFINER
-- function exposing only id + full_name for actual staff accounts.
create or replace function public.list_staff_profiles()
returns table (id uuid, full_name text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.full_name
  from public.profiles p
  where p.role in ('owner', 'coach')
    and current_user_role() in ('owner', 'coach')
  order by p.full_name;
$$;

grant execute on function public.list_staff_profiles() to authenticated;

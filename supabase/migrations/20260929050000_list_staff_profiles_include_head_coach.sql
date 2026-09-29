-- Bug fix: list_staff_profiles() (the coach picker on Attendance and
-- Tournament Coach Hours) predates the head_coach role and only returned
-- owners and coaches -- so a head coach could never pick themselves to log
-- their own hours. Head coaches are staff; include them.
create or replace function public.list_staff_profiles()
returns table(id uuid, full_name text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select p.id, p.full_name
  from public.profiles p
  where p.role in ('owner', 'coach', 'head_coach')
    and current_user_role() in ('owner', 'coach', 'head_coach')
  order by p.full_name;
$$;

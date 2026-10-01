-- list_athletes_for_staff() is SECURITY DEFINER and does its own role check,
-- bypassing the athletes table RLS entirely -- the policy change in the
-- assistant_coach_role migration doesn't reach this function, so assistant
-- coaches would see an empty roster on admin-athletes.html without this.
create or replace function public.list_athletes_for_staff()
returns setof athletes
language sql
stable
security definer
set search_path to 'public'
as $$
  select * from public.athletes
  where current_user_role() in ('owner', 'coach', 'assistant_coach')
     or (current_user_role() = 'head_coach' and team_slug is not null and public.is_head_coach_for(team_slug));
$$;

-- A "12U Coed" tournament team (slug 12u-coed, see js/tournament-teams.js)
-- isn't a regular team, so nobody is assigned to it directly. Head coaches
-- of either 12U Boys or 12U Girls count as its head coach.
create or replace function public.is_head_coach_for(target_team_slug text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.head_coach_teams
    where profile_id = auth.uid()
      and (
        team_slug = target_team_slug
        or (target_team_slug = '12u-coed' and team_slug in ('12u-boys', '12u-girls'))
      )
  );
$$;

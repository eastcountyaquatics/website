-- A tournament can be for more than one team. team_slugs holds them all;
-- team_slug stays as the first/primary one so older code keeps working.
alter table public.tournaments add column if not exists team_slugs text[];
update public.tournaments set team_slugs = array[team_slug]
  where team_slug is not null and team_slugs is null;

create or replace function public.is_head_coach_for_any(target_team_slugs text[])
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from unnest(coalesce(target_team_slugs, array[]::text[])) s
    where public.is_head_coach_for(s)
  );
$$;

create or replace function public.is_head_coach_for_tournament(target_tournament_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.tournaments t
    where t.id = target_tournament_id
      and public.is_head_coach_for_any(coalesce(t.team_slugs, array[t.team_slug]))
  );
$$;

alter policy "Head coaches can insert their team's tournaments" on public.tournaments
  with check (public.is_head_coach_for_any(coalesce(team_slugs, array[team_slug])));
alter policy "Head coaches can update their team's tournaments" on public.tournaments
  using (public.is_head_coach_for_any(coalesce(team_slugs, array[team_slug])))
  with check (public.is_head_coach_for_any(coalesce(team_slugs, array[team_slug])));
alter policy "Head coaches can view their team's tournaments" on public.tournaments
  using (public.is_head_coach_for_any(coalesce(team_slugs, array[team_slug])));

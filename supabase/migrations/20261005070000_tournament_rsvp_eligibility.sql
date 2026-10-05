-- Families can only RSVP yes/maybe to a tournament their athlete is
-- eligible for under the tournament's own rules: on one of its teams, and
-- not over its maximum age as of its "age as of" date (default: the
-- August 1 on/after the start). Mirrors dashboard.html's
-- athleteEligibleForTournament(). Staff and direct invites are exempt.

-- An athlete's team: staff-assigned, else derived from birthdate + sex
-- using the club's season rule (age on Aug 1 of the year after the season
-- starts) -- same as js/team-age.js.
create or replace function public.athlete_team_slug(p_team_slug text, p_birthdate date, p_sex text)
returns text
language plpgsql
stable
as $$
declare
  season_year int;
  age int;
  bracket text;
begin
  if p_team_slug is not null then return p_team_slug; end if;
  if p_birthdate is null then return null; end if;
  season_year := case when current_date >= make_date(extract(year from current_date)::int, 8, 1)
                      then extract(year from current_date)::int
                      else extract(year from current_date)::int - 1 end;
  age := date_part('year', age(make_date(season_year + 1, 8, 1), p_birthdate))::int;
  bracket := case when age <= 8 then '8u' when age <= 10 then '10u' when age <= 12 then '12u'
                  when age <= 14 then '14u' when age <= 16 then '16u' when age <= 18 then '18u' end;
  if bracket is null then return null; end if;
  if bracket in ('8u', '10u') then return bracket || '-coed'; end if;
  if lower(coalesce(p_sex, '')) = 'male' then return bracket || '-boys'; end if;
  if lower(coalesce(p_sex, '')) = 'female' then return bracket || '-girls'; end if;
  return null;
end;
$$;

create or replace function public.athlete_eligible_for_tournament(p_athlete_id uuid, p_tournament_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  a record;
  t record;
  slug text;
  my_slugs text[];
  as_of date;
  y int;
begin
  select team_slug, birthdate, sex into a from public.athletes where id = p_athlete_id;
  select team_slug, team_slugs, event_date, max_age, age_as_of into t from public.tournaments where id = p_tournament_id;
  if not found then return false; end if;

  slug := public.athlete_team_slug(a.team_slug, a.birthdate, a.sex);
  my_slugs := array[slug];
  if slug in ('12u-boys', '12u-girls') then my_slugs := my_slugs || '12u-coed'; end if;
  if not (coalesce(t.team_slugs, array[t.team_slug]) && my_slugs) then return false; end if;

  if t.max_age is not null then
    if a.birthdate is null then return false; end if;
    y := extract(year from t.event_date)::int;
    as_of := coalesce(t.age_as_of,
      case when t.event_date <= make_date(y, 8, 1) then make_date(y, 8, 1) else make_date(y + 1, 8, 1) end);
    if date_part('year', age(as_of, a.birthdate))::int > t.max_age then return false; end if;
  end if;
  return true;
end;
$$;

create or replace function public.enforce_tournament_rsvp_eligibility()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null or new.response not in ('yes', 'maybe') then
    return new;
  end if;
  -- Staff managing other families' athletes are exempt; a coach RSVPing
  -- their OWN kid follows the same rules as any parent.
  if public.current_user_role() in ('owner', 'coach', 'head_coach')
     and not exists (select 1 from public.athletes where id = new.athlete_id and parent_id = auth.uid()) then
    return new;
  end if;
  if exists (select 1 from public.tournament_invites i
             where i.tournament_id = new.tournament_id and i.athlete_id = new.athlete_id) then
    return new;
  end if;
  if not public.athlete_eligible_for_tournament(new.athlete_id, new.tournament_id) then
    raise exception 'This athlete isn''t eligible for this tournament (team or age limit). Contact the club if you think that''s wrong.';
  end if;
  return new;
end;
$$;

create trigger tournament_rsvps_eligibility
  before insert or update on public.tournament_rsvps
  for each row execute function public.enforce_tournament_rsvp_eligibility();

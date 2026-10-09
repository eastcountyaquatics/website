-- An athlete added to an account just sits there until they actually join:
-- a paid session registration (within the last 6 months -- a session runs
-- ~3 months, so last season's still counts until the next one opens), an
-- active 2-week free trial, or a current Masters membership. Only then are
-- they on a team for Registered Athletes, Attendance, tournaments and team
-- updates.
create or replace function public.athlete_is_active(p_athlete_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
      select 1 from public.purchases
      where athlete_id = p_athlete_id and status = 'paid' and registration_option_id is not null
        and created_at > now() - interval '6 months')
    or exists (
      select 1 from public.athletes
      where id = p_athlete_id and trial_expires_on >= (now() at time zone 'America/Los_Angeles')::date)
    or exists (
      select 1 from public.masters_subscriptions
      where athlete_id = p_athlete_id and status in ('pending', 'active', 'paused', 'past_due'));
$$;

-- Ids of registered athletes the caller may know about: staff (and the
-- service role, for edge functions) get everyone; a family only their own.
create or replace function public.active_athlete_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select a.id from public.athletes a
  where public.athlete_is_active(a.id)
    and (auth.uid() is null
         or coalesce(public.current_user_role(), '') in ('owner', 'coach', 'head_coach', 'assistant_coach')
         or a.parent_id = auth.uid());
$$;

revoke all on function public.athlete_is_active(uuid) from public, anon;
revoke all on function public.active_athlete_ids() from public, anon;
grant execute on function public.athlete_is_active(uuid) to authenticated, service_role;
grant execute on function public.active_athlete_ids() to authenticated, service_role;

-- Tournament RSVPs: only registered athletes are on a team. (Direct
-- invites from the club are still exempt in the RSVP trigger.)
create or replace function public.athlete_eligible_for_tournament(p_athlete_id uuid, p_tournament_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  a record;
  t record;
  slug text;
  my_slugs text[];
  as_of date;
  y int;
begin
  if not public.athlete_is_active(p_athlete_id) then return false; end if;
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

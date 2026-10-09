-- Masters as a real team, like the youth ones. Athletes 19+ were already
-- "masters" for tournaments (athlete_team_slug), but Masters wasn't in the
-- club's team list, so it couldn't be picked for Team Interest posts,
-- Attendance, a Head Coach's teams, the Schedules editor or BAND links.
-- Unpublished until someone fills in a practice schedule on Admin >
-- Schedules (masters.html shows it once published).
insert into public.schedules (team_slug, team_label, sort_order, is_published)
values ('masters', 'Masters', 12, false)
on conflict (team_slug) do nothing;

insert into public.band_links (team_slug, label, url)
values ('masters', 'Masters', null)
on conflict (team_slug) do nothing;

-- Head coaches saw only athletes hand-assigned to their team; most
-- athletes (and every Masters player) get their team from birthdate/sex.
create or replace function public.list_athletes_for_staff()
 returns setof athletes
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select * from public.athletes a
  where current_user_role() in ('owner', 'coach', 'assistant_coach')
     or (current_user_role() = 'head_coach'
         and public.is_head_coach_for(public.athlete_team_slug(a.team_slug, a.birthdate, a.sex)));
$function$;

-- Invite notifications named the team from tournaments.team_slug only
-- (blank for multi-team and tournament-only teams like Masters/12U Coed).
create or replace function public.notify_tournament_invite()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_parent_id uuid;
  v_athlete_name text;
  v_tournament_name text;
  v_event_date date;
  v_team_slug text;
  v_team_label text;
begin
  select parent_id, full_name into v_parent_id, v_athlete_name
  from public.athletes where id = new.athlete_id;

  select name, event_date, coalesce(team_slugs[1], team_slug) into v_tournament_name, v_event_date, v_team_slug
  from public.tournaments where id = new.tournament_id;

  if v_team_slug is not null then
    select team_label into v_team_label from public.schedules where team_slug = v_team_slug;
    if v_team_label is null and v_team_slug = '12u-coed' then v_team_label := '12U Coed'; end if;
  end if;

  if v_parent_id is null then
    return new;
  end if;

  insert into public.notifications (user_id, type, title, body, data)
  values (
    v_parent_id,
    'tournament_invite',
    coalesce(v_athlete_name, 'Your athlete') || ' is invited to ' || coalesce(v_tournament_name, 'a tournament'),
    coalesce(v_tournament_name, 'A tournament') ||
      (case when v_event_date is not null then ' on ' || to_char(v_event_date, 'FMMonth FMDD, YYYY') else '' end) ||
      (case when v_team_label is not null then ' with ' || v_team_label else '' end) || '.',
    jsonb_build_object(
      'tournament_id', new.tournament_id,
      'athlete_id', new.athlete_id,
      'invite_id', new.id,
      'tournament_name', v_tournament_name,
      'event_date', v_event_date,
      'team_slug', v_team_slug,
      'team_label', v_team_label,
      'athlete_name', v_athlete_name
    )
  );
  return new;
end;
$function$;

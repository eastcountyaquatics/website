-- Head coaches can put Coaches and Assistant Coaches on (or take them off)
-- their own team(s): Admin > Team Coaches. A coach's teams are the "Team
-- Group" labels on their Coaches page card (coaches.team_group, e.g.
-- "12U Boys & 14U Boys"), which drive the coach list on each team page and
-- the Teams line on Coach Pay.
--
-- guard_coach_self_edit only lets the Manager change team_group, so this
-- goes through one checked function instead of opening up the table:
--   - the Manager can set any team;
--   - a head coach only teams they head (head_coach_teams), and only on
--     cards titled Coach or Assistant Coach (not other Head Coaches or
--     Managers).

create or replace function public.guard_coach_self_edit()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if current_setting('app.linking_via_signup', true) = 'true'
     or public.current_user_role() = 'owner'
     or auth.uid() is null then
    return new;
  end if;

  -- set_coach_on_team (below) has already checked the head coach may make
  -- this change; it touches team_group only.
  if current_setting('app.coach_team_assign', true) = 'true'
     and new.full_name is not distinct from old.full_name
     and new.role_title is not distinct from old.role_title
     and new.sort_order is not distinct from old.sort_order
     and new.is_active is not distinct from old.is_active
     and new.invite_email is not distinct from old.invite_email
     and new.bio is not distinct from old.bio
     and new.photo_url is not distinct from old.photo_url
     and new.contact_email is not distinct from old.contact_email
     and new.profile_id is not distinct from old.profile_id then
    return new;
  end if;

  if new.full_name is distinct from old.full_name
     or new.role_title is distinct from old.role_title
     or new.team_group is distinct from old.team_group
     or new.sort_order is distinct from old.sort_order
     or new.is_active is distinct from old.is_active
     or new.invite_email is distinct from old.invite_email then
    raise exception 'Only the club manager can change a coach''s name, title, teams, order or status.';
  end if;

  if (new.bio is distinct from old.bio
      or new.photo_url is distinct from old.photo_url
      or new.contact_email is distinct from old.contact_email)
     and old.profile_id is distinct from auth.uid() then
    raise exception 'You can only edit your own coach profile.';
  end if;

  return new;
end;
$function$;

create or replace function public.set_coach_on_team(p_coach_id uuid, p_team_slug text, p_on boolean)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  my_role text := public.current_user_role();
  team_lbl text;
  c record;
  parts text[];
  result text;
begin
  if my_role is distinct from 'owner'
     and not (my_role = 'head_coach' and public.is_head_coach_for(p_team_slug)) then
    raise exception 'You can only assign coaches to your own team(s).';
  end if;

  select team_label into team_lbl from public.schedules where team_slug = p_team_slug;
  if team_lbl is null then
    raise exception 'Unknown team.';
  end if;

  select * into c from public.coaches where id = p_coach_id for update;
  if not found then
    raise exception 'Coach not found.';
  end if;
  if my_role <> 'owner' and coalesce(c.role_title, '') not in ('Coach', 'Assistant Coach') then
    raise exception 'Head coaches can assign Coaches and Assistant Coaches only.';
  end if;
  if my_role <> 'owner' and c.is_active is false then
    raise exception 'This coach is archived.';
  end if;

  -- Every other team they're on stays as is; this team is added or removed.
  parts := array(
    select trim(x) from unnest(string_to_array(coalesce(c.team_group, ''), '&')) x
    where trim(x) <> '' and lower(trim(x)) <> lower(team_lbl)
  );
  if p_on then
    parts := parts || team_lbl;
  end if;

  -- Club team order (Splashball, 8U ... Masters); anything else last.
  select string_agg(p, ' & ' order by coalesce(s.sort_order, 999), p) into result
  from unnest(parts) p
  left join public.schedules s on lower(s.team_label) = lower(p);

  perform set_config('app.coach_team_assign', 'true', true);
  update public.coaches set team_group = nullif(result, '') where id = p_coach_id;
  perform set_config('app.coach_team_assign', 'false', true);

  return nullif(result, '');
end;
$function$;

revoke all on function public.set_coach_on_team(uuid, text, boolean) from public, anon;
grant execute on function public.set_coach_on_team(uuid, text, boolean) to authenticated;

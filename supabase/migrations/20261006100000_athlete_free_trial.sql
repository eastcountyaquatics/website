-- 2-week free trial for new athletes, started by the family from My
-- Account (replaces the Google Form). A trial athlete is a normal
-- registered athlete with trial dates on it, so they show up on
-- Registered Athletes / Attendance with "Free Trial -- expires <date>".
alter table public.athletes add column if not exists trial_started_on date;
alter table public.athletes add column if not exists trial_expires_on date;
grant select (trial_started_on, trial_expires_on) on public.athletes to authenticated;

-- Families can't write team_slug / coach_notes / trial dates themselves.
-- (The old check also let a NULL role -- every family -- through, since
-- NULL NOT IN (...) is NULL, not true.) start_free_trial sets the
-- eca.free_trial flag for its own write.
create or replace function public.enforce_athlete_staff_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_staff boolean := coalesce(current_user_role(), '') in ('owner', 'coach', 'head_coach');
  via_trial boolean := coalesce(current_setting('eca.free_trial', true), '') = 'on';
begin
  if auth.uid() is null or is_staff then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.team_slug is not null or new.coach_notes is not null
       or new.trial_started_on is not null or new.trial_expires_on is not null then
      raise exception 'Only staff can set team assignment, coach notes or trial dates';
    end if;
    return new;
  end if;
  if new.team_slug is distinct from old.team_slug or new.coach_notes is distinct from old.coach_notes then
    raise exception 'Only staff can change team assignment or coach notes';
  end if;
  if (new.trial_started_on is distinct from old.trial_started_on or new.trial_expires_on is distinct from old.trial_expires_on)
     and not via_trial then
    raise exception 'Free trials are started from My Account';
  end if;
  return new;
end;
$$;

create or replace trigger athletes_enforce_staff_fields
  before insert or update on public.athletes
  for each row
  execute function public.enforce_athlete_staff_fields();

-- One free trial per athlete, only for athletes who have never paid for a
-- session, and only for youth (19+ go through Masters). Runs 14 days
-- from today (club time).
create or replace function public.start_free_trial(p_athlete_id uuid)
returns date
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.athletes;
  today date := (now() at time zone 'America/Los_Angeles')::date;
  cutoff date;
  v_age int;
begin
  select * into a from public.athletes where id = p_athlete_id and parent_id = auth.uid();
  if not found then
    raise exception 'Athlete not found';
  end if;
  if a.trial_started_on is not null then
    raise exception '% already had a free trial (started %).', a.full_name, to_char(a.trial_started_on, 'Mon DD, YYYY');
  end if;
  if exists (select 1 from public.purchases where athlete_id = a.id and status = 'paid') then
    raise exception 'The free trial is for new athletes only -- % is already registered.', a.full_name;
  end if;
  if a.birthdate is null then
    raise exception 'Add a birthdate for % first.', a.full_name;
  end if;
  -- Age on Aug 1 of the year after the season starts (js/team-age.js).
  cutoff := make_date(
    (case when extract(month from today) >= 8 then extract(year from today) else extract(year from today) - 1 end)::int + 1, 8, 1);
  v_age := extract(year from age(cutoff, a.birthdate))::int;
  if v_age > 18 then
    raise exception 'The free trial is for youth athletes -- adults can join Masters.';
  end if;

  perform set_config('eca.free_trial', 'on', true);
  update public.athletes
    set trial_started_on = today, trial_expires_on = today + 14
    where id = a.id;
  perform set_config('eca.free_trial', 'off', true);
  return today + 14;
end;
$$;

revoke all on function public.start_free_trial(uuid) from public, anon;
grant execute on function public.start_free_trial(uuid) to authenticated;

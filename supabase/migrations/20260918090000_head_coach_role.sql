-- New Head Coach access type (item 33): real access, not just navigation
-- hiding -- every policy below is enforced at the database layer the same
-- way owner/coach access already is, scoped to whichever team(s) a head
-- coach is assigned to via head_coach_teams.
alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('owner', 'coach', 'head_coach'));

create table public.head_coach_teams (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  team_slug text not null references public.schedules(team_slug) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, team_slug)
);

alter table public.head_coach_teams enable row level security;

create policy "Owners manage head coach team assignments"
  on public.head_coach_teams for all
  to authenticated
  using (public.current_user_role() = 'owner')
  with check (public.current_user_role() = 'owner');

create policy "Head coaches can see their own team assignments"
  on public.head_coach_teams for select
  to authenticated
  using (profile_id = (select auth.uid()));

create or replace function public.is_head_coach_for(target_team_slug text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.head_coach_teams
    where profile_id = auth.uid() and team_slug = target_team_slug
  );
$$;
grant execute on function public.is_head_coach_for(text) to authenticated;

-- Schedules: a head coach can manage only their own assigned team(s)' row.
create policy "Head coaches can view their team's schedule"
  on public.schedules for select
  to authenticated
  using (public.is_head_coach_for(team_slug));
create policy "Head coaches can update their team's schedule"
  on public.schedules for update
  to authenticated
  using (public.is_head_coach_for(team_slug))
  with check (public.is_head_coach_for(team_slug));

-- Roster: view/update athletes on their assigned team(s). Athletes without
-- an explicit team_slug (relying on the age/sex-derived default) are a
-- known gap here -- that fallback is computed in the browser, not
-- expressible as a row-level check, so a head coach only sees athletes
-- staff have explicitly assigned to their team via team_slug.
create policy "Head coaches can view their team's athletes"
  on public.athletes for select
  to authenticated
  using (team_slug is not null and public.is_head_coach_for(team_slug));
create policy "Head coaches can update their team's athletes"
  on public.athletes for update
  to authenticated
  using (team_slug is not null and public.is_head_coach_for(team_slug))
  with check (team_slug is not null and public.is_head_coach_for(team_slug));

-- Attendance: manage roll call/hours rows for their assigned team(s).
create policy "Head coaches manage their team's attendance"
  on public.attendance for all
  to authenticated
  using (public.is_head_coach_for(team_slug))
  with check (public.is_head_coach_for(team_slug));

-- Tournaments: view/manage tournaments tied to their team(s). A tournament
-- with no team_slug (a standalone invite-only one) is an owner/coach-only
-- concern, same as today.
create policy "Head coaches can view their team's tournaments"
  on public.tournaments for select
  to authenticated
  using (team_slug is not null and public.is_head_coach_for(team_slug));
create policy "Head coaches can insert their team's tournaments"
  on public.tournaments for insert
  to authenticated
  with check (team_slug is not null and public.is_head_coach_for(team_slug));
create policy "Head coaches can update their team's tournaments"
  on public.tournaments for update
  to authenticated
  using (team_slug is not null and public.is_head_coach_for(team_slug))
  with check (team_slug is not null and public.is_head_coach_for(team_slug));

create policy "Head coaches manage invites for their team's tournaments"
  on public.tournament_invites for all
  to authenticated
  using (exists (
    select 1 from public.tournaments t
    where t.id = tournament_invites.tournament_id and t.team_slug is not null and public.is_head_coach_for(t.team_slug)
  ))
  with check (exists (
    select 1 from public.tournaments t
    where t.id = tournament_invites.tournament_id and t.team_slug is not null and public.is_head_coach_for(t.team_slug)
  ));

create policy "Head coaches manage RSVPs for their team's tournaments"
  on public.tournament_rsvps for all
  to authenticated
  using (exists (
    select 1 from public.tournaments t
    where t.id = tournament_rsvps.tournament_id and t.team_slug is not null and public.is_head_coach_for(t.team_slug)
  ))
  with check (exists (
    select 1 from public.tournaments t
    where t.id = tournament_rsvps.tournament_id and t.team_slug is not null and public.is_head_coach_for(t.team_slug)
  ));

-- Team Interest: manage announcements + see all responses for their team(s).
create policy "Head coaches manage announcements for their team"
  on public.team_announcements for all
  to authenticated
  using (public.is_head_coach_for(team_slug))
  with check (public.is_head_coach_for(team_slug));

create policy "Head coaches manage responses for their team's announcements"
  on public.team_announcement_responses for all
  to authenticated
  using (exists (
    select 1 from public.team_announcements ann
    where ann.id = team_announcement_responses.announcement_id and public.is_head_coach_for(ann.team_slug)
  ))
  with check (exists (
    select 1 from public.team_announcements ann
    where ann.id = team_announcement_responses.announcement_id and public.is_head_coach_for(ann.team_slug)
  ));

-- Three existing role-gated functions need to know about head_coach too,
-- or this whole feature silently does nothing for them:
--
-- 1. admin-athletes.html reads the roster through list_athletes_for_staff()
--    (not a plain select) because coach_notes is a protected column -- a
--    head coach calling it must see their own team's athletes, not
--    everyone's, so this one gets real team filtering rather than just
--    being added to the allowed-role list.
create or replace function public.list_athletes_for_staff()
returns setof public.athletes
language sql
stable
security definer
set search_path = public
as $$
  select * from public.athletes
  where current_user_role() in ('owner', 'coach')
     or (current_user_role() = 'head_coach' and team_slug is not null and public.is_head_coach_for(team_slug));
$$;

-- 2. Attendance -> Log Hours calls list_staff_profiles() to build the
--    coach picker -- a head coach needs to reach that picker too (the
--    list itself is just names, not scoped data).
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
    and current_user_role() in ('owner', 'coach', 'head_coach')
  order by p.full_name;
$$;

-- 3. The trigger that blocks non-staff from changing an athlete's
--    team_slug/coach_notes must not also block a head coach -- the RLS
--    policy above already limits which rows/teams they can touch, so this
--    only needs to stop treating them as an ordinary parent.
create or replace function public.enforce_athlete_staff_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.team_slug is distinct from old.team_slug or new.coach_notes is distinct from old.coach_notes)
     and auth.uid() is not null
     and current_user_role() not in ('owner', 'coach', 'head_coach') then
    raise exception 'Only staff can change team assignment or coach notes';
  end if;
  return new;
end;
$$;

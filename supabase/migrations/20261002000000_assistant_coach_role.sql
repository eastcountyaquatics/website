-- New club-wide login role: Assistant Coach. Can take attendance, view (not
-- edit) the roster/schedules/tournaments, and log their own coaching hours
-- (practice + tournament) -- narrower than a full Coach, who can also
-- manage schedules/tournaments/the roster and log hours for any coach.
alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('owner', 'coach', 'head_coach', 'assistant_coach'));

-- Pre-existing gap found while adding this: pending_role_assignments never
-- allowed 'head_coach' even though admin-users.html has queued one since
-- the head_coach_pending_assignment migration -- fixed alongside adding
-- 'assistant_coach' since both need the same constraint touched.
alter table public.pending_role_assignments drop constraint pending_role_assignments_role_check;
alter table public.pending_role_assignments add constraint pending_role_assignments_role_check
  check (role in ('owner', 'coach', 'head_coach', 'assistant_coach'));

-- The shared coach-picker (Attendance, Tournament Coach Hours) needs to
-- list assistant coaches too, and let them call it to find themselves.
create or replace function public.list_staff_profiles()
returns table(id uuid, full_name text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select p.id, p.full_name
  from public.profiles p
  where p.role in ('owner', 'coach', 'head_coach', 'assistant_coach')
    and current_user_role() in ('owner', 'coach', 'head_coach', 'assistant_coach')
  order by p.full_name;
$$;

-- Attendance: assistant coaches get the exact same club-wide access as a
-- full coach here (taking attendance isn't restricted further).
alter policy "Owners and coaches manage attendance" on attendance
  using (current_user_role() = any (array['owner', 'coach', 'assistant_coach']))
  with check (current_user_role() = any (array['owner', 'coach', 'assistant_coach']));

-- Roster: view only -- the separate "...can update athletes" policy stays
-- owner/coach only, so assistant coaches never get write access here.
alter policy "Owners and coaches can view all athletes" on athletes
  using (current_user_role() = any (array['owner', 'coach', 'assistant_coach']));

-- Schedules: view only -- insert/update/delete policies stay untouched.
alter policy "Owners and coaches can view all schedules" on schedules
  using (current_user_role() = any (array['owner', 'coach', 'assistant_coach']));

-- Tournaments: view only -- insert/update/delete policies stay untouched.
alter policy "Owners and coaches can view all tournaments" on tournaments
  using (current_user_role() = any (array['owner', 'coach', 'assistant_coach']));

-- Coach hours: own rows only, for both practice and tournament sessions --
-- unlike a full coach, an assistant coach can't log hours for anyone else.
create policy "Assistant coaches manage their own hours"
  on coach_hours for all
  using (current_user_role() = 'assistant_coach' and coach_id = (select auth.uid()))
  with check (current_user_role() = 'assistant_coach' and coach_id = (select auth.uid()));

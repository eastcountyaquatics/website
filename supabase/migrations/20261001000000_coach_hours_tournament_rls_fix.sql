-- The Tournament Coach Hours form lets any coach log hours for any coach
-- (e.g. logging hours for a co-coach), but the coach_hours RLS policies only
-- ever allowed a coach to manage their own rows. That mismatch caused
-- "new row violates row-level security policy for table coach_hours" when
-- submitting tournament hours for someone else.
--
-- Fix: keep the existing "own rows only" policies for practice-type rows
-- (preserves the original practice-hours privacy intent), and add separate
-- policies allowing tournament-type rows to be managed for any coach
-- (head coaches still scoped to their own team).
--
-- Uses ALTER POLICY instead of DROP+CREATE for the existing policies:
-- DROP POLICY statements were hanging against this table in this
-- environment, while ALTER POLICY (rename + redefine) completed instantly.

alter policy "Coaches manage their own coach hours" on coach_hours
  rename to "Coaches manage their own practice hours";

alter policy "Coaches manage their own practice hours" on coach_hours
  using (current_user_role() = 'coach' and session_type = 'practice' and coach_id = (select auth.uid()))
  with check (current_user_role() = 'coach' and session_type = 'practice' and coach_id = (select auth.uid()));

alter policy "Head coaches manage their own hours for their team" on coach_hours
  rename to "Head coaches manage their own practice hours for their team";

alter policy "Head coaches manage their own practice hours for their team" on coach_hours
  using (current_user_role() = 'head_coach' and session_type = 'practice' and coach_id = (select auth.uid()) and is_head_coach_for(team_slug))
  with check (current_user_role() = 'head_coach' and session_type = 'practice' and coach_id = (select auth.uid()) and is_head_coach_for(team_slug));

create policy "Coaches manage tournament hours for any coach"
  on coach_hours for all
  using (current_user_role() = 'coach' and session_type = 'tournament')
  with check (current_user_role() = 'coach' and session_type = 'tournament');

create policy "Head coaches manage tournament hours for their team"
  on coach_hours for all
  using (current_user_role() = 'head_coach' and session_type = 'tournament' and is_head_coach_for(team_slug))
  with check (current_user_role() = 'head_coach' and session_type = 'tournament' and is_head_coach_for(team_slug));

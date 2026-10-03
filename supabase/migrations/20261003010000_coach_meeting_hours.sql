-- Coaches are sometimes paid for meetings. A meeting is logged like a
-- practice (own hours, paid at the hourly rate) but under its own type so
-- Coach Pay and the month-end sign-off can show it separately. Meetings
-- aren't tied to one team: team_slug = 'club' means club-wide.
alter table public.coach_hours drop constraint coach_hours_session_type_check;
alter table public.coach_hours add constraint coach_hours_session_type_check
  check (session_type = any (array['practice'::text, 'tournament'::text, 'meeting'::text]));

alter policy "Coaches manage their own practice hours" on public.coach_hours
  using (current_user_role() = 'coach' and session_type in ('practice', 'meeting') and coach_id = (select auth.uid()))
  with check (current_user_role() = 'coach' and session_type in ('practice', 'meeting') and coach_id = (select auth.uid()));

alter policy "Head coaches manage their own practice hours for their team" on public.coach_hours
  using (current_user_role() = 'head_coach' and coach_id = (select auth.uid())
         and ((session_type = 'practice' and is_head_coach_for(team_slug)) or session_type = 'meeting'))
  with check (current_user_role() = 'head_coach' and coach_id = (select auth.uid())
         and ((session_type = 'practice' and is_head_coach_for(team_slug)) or session_type = 'meeting'));

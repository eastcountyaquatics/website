-- The Manager can delete an athlete (e.g. test records) from Registered
-- Athletes. Attendance/RSVPs cascade; purchases keep their row with the
-- athlete link cleared (FK is ON DELETE SET NULL).
create policy "Owners can delete athletes" on public.athletes
  for delete to authenticated
  using (current_user_role() = 'owner');

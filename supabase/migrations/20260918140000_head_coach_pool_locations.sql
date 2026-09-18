-- Caught during a final review: admin-schedules.html's "Other / Add
-- Location" flow (part of the Schedules area a head coach is granted)
-- writes to pool_locations, but only owner/coach could insert/update/
-- delete there -- a head coach adding a new pool for their own team's
-- schedule would have hit an RLS violation. pool_locations is a shared,
-- low-sensitivity list (just names/addresses), so this grants head
-- coaches the same full access owner/coach already have here, rather
-- than inventing a narrower "insert only" carve-out for a resource
-- nobody "owns" per team.
create policy "Head coaches manage pool locations"
  on public.pool_locations for all
  to authenticated
  using (current_user_role() = 'head_coach')
  with check (current_user_role() = 'head_coach');

-- Optional manual team assignment. When null the roster falls back to the
-- team derived from birthdate + gender; setting it pins the athlete to a
-- specific team (a 12-year-old playing up on 14U, for example).
alter table public.athletes add column team_slug text;

-- Owners and coaches need to be able to set it. Parents already have full
-- control of their own athletes via "Parents manage their own athletes".
create policy "Owners and coaches can update athletes"
  on public.athletes for update
  using (public.current_user_role() in ('owner', 'coach'))
  with check (public.current_user_role() in ('owner', 'coach'));

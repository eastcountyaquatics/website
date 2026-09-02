-- Coaches need to see the team roster (athletes + who's registered), not
-- just the club owner. Replaces the owner-only select policy with one that
-- also covers coaches.

drop policy "Owners can view all athletes" on public.athletes;

create policy "Owners and coaches can view all athletes"
  on public.athletes for select
  using (public.current_user_role() in ('owner', 'coach'));

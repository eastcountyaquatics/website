-- Caught during final review: tournament_price_tiers had no head-coach
-- policy at all, so a head coach couldn't view (unpublished), add, edit,
-- or delete price tiers on their own tournament -- even though tiers are
-- part of the Tournaments area they're granted. Same
-- is_head_coach_for_tournament() helper already used for
-- tournament_invites/tournament_rsvps, for the same recursion-safety
-- reason (a plain subquery on tournaments here would risk the same cycle
-- fixed in head_coach_tournament_recursion_fix).
create policy "Head coaches manage tiers for their team's tournaments"
  on public.tournament_price_tiers for all
  to authenticated
  using (public.is_head_coach_for_tournament(tournament_id))
  with check (public.is_head_coach_for_tournament(tournament_id));

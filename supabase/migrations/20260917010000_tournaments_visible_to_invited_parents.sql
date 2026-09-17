-- Parents could already see their own tournament_invites and
-- tournament_rsvps rows for ANY tournament regardless of team or publish
-- state, but had no way to read the tournaments row itself unless it was
-- published -- so a cross-team/individual invite to an unpublished
-- tournament (the club's own documented pattern: "Published... invite
-- links work either way") would silently fail to show up on the family's
-- dashboard. This closes that gap without loosening anything else: a
-- parent can now also see a tournament they have a direct invite to.
create policy "Parents can view tournaments they're invited to"
  on public.tournaments for select
  to authenticated
  using (
    exists (
      select 1
      from public.tournament_invites ti
      join public.athletes a on a.id = ti.athlete_id
      where ti.tournament_id = tournaments.id
        and a.parent_id = (select auth.uid())
    )
  );

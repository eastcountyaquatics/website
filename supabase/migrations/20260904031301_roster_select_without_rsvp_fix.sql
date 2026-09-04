-- A coach was blocked from putting an athlete on a tournament roster
-- until that athlete's family had RSVP'd first -- but a coach should be
-- able to select straight off the team list and have it show up on that
-- family's account, RSVP or not (e.g. they confirmed verbally). The
-- existing trigger only fired on UPDATE, which assumed a tournament_rsvps
-- row already existed; the admin UI now upserts a fresh row (defaulting
-- response to 'yes') for an athlete with no prior RSVP, so a second
-- trigger covers the INSERT case and creates the invite the same way.
--
-- Postgres won't allow a single INSERT-OR-UPDATE trigger whose WHEN
-- clause references OLD (OLD doesn't exist yet on an INSERT) -- hence
-- two triggers sharing the same function instead of one combined one.
create trigger tournament_rsvps_create_invite_on_insert
  after insert on public.tournament_rsvps
  for each row
  when (new.on_roster = true)
  execute function public.tournament_rsvp_create_invite();

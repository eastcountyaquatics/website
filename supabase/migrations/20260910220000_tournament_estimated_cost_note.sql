-- location/hotel info already exist on tournaments but only ever surface
-- on the invite-only payment page, after a family is already on the
-- roster. The team RSVP card on the dashboard -- the actual interest-form
-- replacement -- had nowhere to show a rough cost before someone answers
-- yes/maybe/no. Plain display text, not billing data; the real charge is
-- whatever the price tiers add up to once a coach builds the roster.
alter table public.tournaments
  add column estimated_cost_note text;

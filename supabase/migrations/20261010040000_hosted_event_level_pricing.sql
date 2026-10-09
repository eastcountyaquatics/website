-- Hosted events: price per team by age group, and visiting clubs pick
-- which age groups (and how many teams in each) they're bringing.
--
-- hosted_events
--   price_by_level  false: every team pays fee_cents.
--                   true:  each age group has its own price in level_prices
--                          ([{level, fee_cents}]); fee_cents holds the lowest,
--                          for "from $X" displays.
-- hosted_event_invites
--   registered_teams  what the club picked at signup: [{level, count, fee_cents}]
--                     (written by create-hosted-event-checkout from the event's
--                     own prices, final once the invite is paid).
--   amount_cents      the total for those teams.
alter table public.hosted_events
  add column if not exists price_by_level boolean not null default false,
  add column if not exists level_prices jsonb not null default '[]'::jsonb;

alter table public.hosted_event_invites
  add column if not exists registered_teams jsonb not null default '[]'::jsonb,
  add column if not exists amount_cents integer;

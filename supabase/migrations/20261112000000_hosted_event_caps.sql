-- Hosted events: owners can cap how many teams sign up per age group.
--   level_caps  [{level, max_total, max_per_club}]  either number may be null (no limit).
--   max_total     all clubs together (spots in the age group)
--   max_per_club  one club's teams in that age group
alter table public.hosted_events
  add column if not exists level_caps jsonb not null default '[]'::jsonb;

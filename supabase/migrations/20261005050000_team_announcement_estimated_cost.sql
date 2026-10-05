-- Interest forms (Team Interest posts) can show an estimated cost so
-- families know roughly what they're saying yes to.
alter table public.team_announcements
  add column if not exists estimated_cost text
  check (estimated_cost is null or length(estimated_cost) <= 200);

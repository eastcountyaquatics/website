-- Structured team reference so admin picks a real team from a dropdown
-- (matching the schedules table) instead of typing it into the free-text
-- label, and so registration options can be filtered/grouped by team.
alter table public.registration_options
  add column team_slug text references public.schedules(team_slug) on delete set null;

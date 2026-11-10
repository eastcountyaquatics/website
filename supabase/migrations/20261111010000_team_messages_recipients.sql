-- Keep who each team message was emailed to, so staff can export the history as a CSV.
alter table public.team_messages
  add column if not exists recipients text[] not null default '{}';

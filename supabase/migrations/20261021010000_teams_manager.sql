-- Admin > Teams: owners add, rename, reorder and retire teams without code.
-- schedules already holds one row per team (team_slug, team_label,
-- sort_order) and every admin page reads its team list from it; these
-- columns add what the public site needs for a team that isn't built in.
--   page_url     where the team's page is (built-in teams: null = team-<slug>.html)
--   age_min/max  + team_gender: who the team is for, so the team finder and
--                registration offer it. Null = the built-in age rule decides
--                (8U/10U coed, 12U-18U boys/girls), as today.
--   is_active    false = retired: hidden from the team finder, registration
--                choices and the public directory; history is kept.
alter table public.schedules add column if not exists page_url text
  check (page_url is null or (length(page_url) <= 300 and page_url !~* '^\s*(javascript|data):'));
alter table public.schedules add column if not exists age_min int check (age_min is null or age_min between 3 and 99);
alter table public.schedules add column if not exists age_max int check (age_max is null or age_max between 3 and 99);
alter table public.schedules add column if not exists team_gender text
  check (team_gender is null or team_gender in ('coed', 'boys', 'girls'));
alter table public.schedules add column if not exists is_active boolean not null default true;

-- A custom page (Edit Website > New Page) can be a team's page: it then shows
-- that team's published schedule, coaches and open sessions under its text.
alter table public.pages add column if not exists team_slug text;

-- The public team list. schedules itself only shows visitors teams whose
-- schedule is published; the directory (names, pages, ages) is public.
create or replace function public.team_directory()
returns table (team_slug text, team_label text, page_url text, age_min int, age_max int, team_gender text, sort_order int)
language sql stable security definer set search_path = public as $$
  select s.team_slug, s.team_label, s.page_url, s.age_min, s.age_max, s.team_gender, s.sort_order
  from public.schedules s
  where s.is_active
  order by s.sort_order, s.team_label;
$$;
revoke all on function public.team_directory() from public;
grant execute on function public.team_directory() to anon, authenticated, service_role;

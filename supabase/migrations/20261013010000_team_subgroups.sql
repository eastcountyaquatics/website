-- Subgroups inside a team (e.g. "Goalies", "A squad") that staff can
-- message separately from the whole team. A message lands on each family's
-- My Account (a notification) and, when email is configured, in their inbox.
-- Managed by the Manager and by a team's Head Coach for that team.

create table if not exists public.team_subgroups (
  id uuid primary key default gen_random_uuid(),
  team_slug text not null,
  name text not null check (length(btrim(name)) between 1 and 60),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists team_subgroups_team_name_uniq
  on public.team_subgroups (team_slug, lower(btrim(name)));

create table if not exists public.team_subgroup_members (
  subgroup_id uuid not null references public.team_subgroups(id) on delete cascade,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (subgroup_id, athlete_id)
);
create index if not exists team_subgroup_members_athlete_idx on public.team_subgroup_members (athlete_id);

-- Log of what was sent, so staff can see it went out and to whom.
create table if not exists public.team_messages (
  id uuid primary key default gen_random_uuid(),
  team_slug text not null,
  subgroup_id uuid references public.team_subgroups(id) on delete set null,
  audience_label text not null,
  subject text not null check (length(btrim(subject)) between 1 and 200),
  body text not null check (length(btrim(body)) between 1 and 2000),
  sent_by uuid references public.profiles(id) on delete set null,
  families_notified integer not null default 0,
  families_emailed integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists team_messages_team_idx on public.team_messages (team_slug, created_at desc);

alter table public.team_subgroups enable row level security;
alter table public.team_subgroup_members enable row level security;
alter table public.team_messages enable row level security;

create policy "Staff manage their teams' subgroups" on public.team_subgroups
  for all to authenticated
  using (public.current_user_role() = 'owner' or public.is_head_coach_for(team_slug))
  with check (public.current_user_role() = 'owner' or public.is_head_coach_for(team_slug));

create policy "Coaches view subgroups" on public.team_subgroups
  for select to authenticated
  using (public.current_user_role() in ('coach', 'assistant_coach'));

create policy "Staff manage their teams' subgroup members" on public.team_subgroup_members
  for all to authenticated
  using (exists (select 1 from public.team_subgroups g
                 where g.id = subgroup_id
                   and (public.current_user_role() = 'owner' or public.is_head_coach_for(g.team_slug))))
  with check (exists (select 1 from public.team_subgroups g
                      where g.id = subgroup_id
                        and (public.current_user_role() = 'owner' or public.is_head_coach_for(g.team_slug))));

create policy "Coaches view subgroup members" on public.team_subgroup_members
  for select to authenticated
  using (public.current_user_role() in ('coach', 'assistant_coach'));

create policy "Staff view their teams' sent messages" on public.team_messages
  for select to authenticated
  using (public.current_user_role() = 'owner' or public.is_head_coach_for(team_slug));
-- Rows are written by the send-team-message function (service role).

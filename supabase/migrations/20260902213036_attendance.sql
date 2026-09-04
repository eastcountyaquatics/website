create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  team_slug text not null references public.schedules(team_slug) on delete cascade,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  session_date date not null,
  present boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (team_slug, athlete_id, session_date)
);

alter table public.attendance enable row level security;

create policy "Owners and coaches manage attendance"
  on public.attendance for all
  using (public.current_user_role() in ('owner', 'coach'))
  with check (public.current_user_role() in ('owner', 'coach'));

create trigger attendance_set_updated_at
  before update on public.attendance
  for each row execute function public.set_updated_at();

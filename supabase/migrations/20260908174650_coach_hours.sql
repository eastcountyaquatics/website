-- Coaches log the hours they worked on the same screen where they take roll,
-- so a practice is one trip to the phone instead of two.
create table if not exists public.coach_hours (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles(id) on delete cascade,
  team_slug text not null,
  session_date date not null,
  -- Quarter-hour granularity is what a stipend actually gets paid on; the
  -- upper bound just catches a fat-fingered "80" for "8.0".
  hours numeric(4,2) not null check (hours > 0 and hours <= 24),
  notes text check (notes is null or length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One entry per coach per team per day. A coach who runs two sessions for
  -- the same team in one day records the combined total.
  unique (coach_id, team_slug, session_date)
);

create index if not exists coach_hours_report_idx
  on public.coach_hours (session_date desc, coach_id);

alter table public.coach_hours enable row level security;

-- A coach reads and writes only their own hours. coach_id is pinned to
-- auth.uid() by the with-check, so nobody can log time against someone else.
create policy "Coaches manage their own hours"
  on public.coach_hours for select
  to authenticated
  using (coach_id = (select auth.uid()));

create policy "Coaches insert their own hours"
  on public.coach_hours for insert
  to authenticated
  with check (
    coach_id = (select auth.uid())
    and public.current_user_role() in ('owner', 'coach')
  );

create policy "Coaches update their own hours"
  on public.coach_hours for update
  to authenticated
  using (coach_id = (select auth.uid()))
  with check (coach_id = (select auth.uid()));

create policy "Coaches delete their own hours"
  on public.coach_hours for delete
  to authenticated
  using (coach_id = (select auth.uid()));

-- The owner needs the whole picture to actually pay anyone, and to fix a
-- mistyped entry.
create policy "Owners view all coach hours"
  on public.coach_hours for select
  to authenticated
  using (public.current_user_role() = 'owner');

create policy "Owners correct any coach hours"
  on public.coach_hours for update
  to authenticated
  using (public.current_user_role() = 'owner')
  with check (public.current_user_role() = 'owner');

create policy "Owners delete any coach hours"
  on public.coach_hours for delete
  to authenticated
  using (public.current_user_role() = 'owner');

create trigger coach_hours_set_updated_at
  before update on public.coach_hours
  for each row execute function public.set_updated_at();

-- Who took roll, so the attendance screen can say "saved by X" rather than
-- leaving a coach guessing whether their taps landed.
alter table public.attendance
  add column if not exists recorded_by uuid references public.profiles(id) on delete set null;

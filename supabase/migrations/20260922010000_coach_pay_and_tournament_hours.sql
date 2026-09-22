-- Fix a real pre-existing privacy gap found while building the Coach Pay
-- page: "Coaches and owners view all coach hours" let ANY coach role read
-- every other coach's logged hours (the RLS qual only checked the role,
-- never the row's own coach_id), even though admin-hours.html's own UI
-- claims a coach only sees their own. Also adds head_coach (missing
-- entirely), scoped to their assigned team like everywhere else.
drop policy "Coaches and owners view all coach hours" on public.coach_hours;
drop policy "Coaches and owners insert coach hours" on public.coach_hours;
drop policy "Coaches and owners update coach hours" on public.coach_hours;
drop policy "Coaches and owners delete coach hours" on public.coach_hours;

create policy "Owners manage all coach hours"
  on public.coach_hours for all
  to authenticated
  using (current_user_role() = 'owner')
  with check (current_user_role() = 'owner');

create policy "Coaches manage their own coach hours"
  on public.coach_hours for all
  to authenticated
  using (current_user_role() = 'coach' and coach_id = (select auth.uid()))
  with check (current_user_role() = 'coach' and coach_id = (select auth.uid()));

create policy "Head coaches manage their own hours for their team"
  on public.coach_hours for all
  to authenticated
  using (current_user_role() = 'head_coach' and coach_id = (select auth.uid()) and public.is_head_coach_for(team_slug))
  with check (current_user_role() = 'head_coach' and coach_id = (select auth.uid()) and public.is_head_coach_for(team_slug));

-- Item 3/4: tournament coaching hours (2 hrs/game, paid the same as
-- practice hours) and out-of-county travel pay ($75/day), logged
-- alongside practice hours on the same Attendance page. A discriminator
-- column keeps the two kinds of session apart so the existing
-- delete-and-replace-by-(team,date) practice save flow can filter to
-- session_type='practice' and never touch tournament rows.
alter table public.coach_hours add column session_type text not null default 'practice'
  check (session_type in ('practice', 'tournament'));
alter table public.coach_hours add column tournament_id uuid references public.tournaments(id) on delete set null;
alter table public.coach_hours add column tournament_name text;
alter table public.coach_hours add column travel_days integer check (travel_days is null or travel_days >= 0);

-- The old unique constraint assumed one row per (coach, team, date) across
-- all session types, but a coach can log both a practice AND a tournament
-- entry for the same team on the same date -- scope it to practice rows
-- only, and give tournament rows their own natural key instead.
alter table public.coach_hours drop constraint coach_hours_coach_id_team_slug_session_date_key;
create unique index coach_hours_practice_unique_idx
  on public.coach_hours (coach_id, team_slug, session_date)
  where session_type = 'practice';
create unique index coach_hours_tournament_unique_idx
  on public.coach_hours (coach_id, tournament_id, session_date)
  where session_type = 'tournament';

-- Item 2: a record of how/when a coach was actually paid -- separate from
-- coach_hours (what they're owed) so the two can be reasoned about
-- independently. Owner-only: payroll is not something coaches need to
-- read or write about each other or themselves.
create table public.coach_payments (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles(id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0),
  paid_date date not null,
  method text not null check (method in ('zelle', 'venmo', 'check')),
  note text check (note is null or length(note) <= 500),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index coach_payments_coach_id_idx on public.coach_payments (coach_id);

alter table public.coach_payments enable row level security;
create policy "Owners manage coach payments"
  on public.coach_payments for all
  to authenticated
  using (current_user_role() = 'owner')
  with check (current_user_role() = 'owner');

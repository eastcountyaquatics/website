-- Tournament coach hours now cover a date RANGE (a tournament is usually a
-- whole weekend, not one day). session_date stays the start date so every
-- existing date filter (Coach Hours, Coach Pay, the month-end sign-off)
-- keeps bucketing the entry by when the tournament started; the end date
-- is only for display. Null for practice rows and single-day tournaments.
alter table public.coach_hours add column session_end_date date;
alter table public.coach_hours add constraint coach_hours_session_end_date_check
  check (session_end_date is null or (session_type = 'tournament' and session_end_date >= session_date));

-- One tournament entry now holds the whole weekend's hours (2 hrs/game,
-- often 8+ games), so the old 24-hour cap -- meant to catch a fat-fingered
-- practice entry -- only applies to practice rows now. 99.99 is the most
-- numeric(4,2) can hold anyway.
alter table public.coach_hours drop constraint coach_hours_hours_check;
alter table public.coach_hours add constraint coach_hours_hours_check
  check (hours > 0 and (hours <= 24 or session_type = 'tournament'));

-- Month-end hours sign-off: once a month every coach with logged hours is
-- emailed a link (see send-monthly-hours-signoff) to review that month's
-- hours and either sign off or ask for edits; the answer is emailed to the
-- club. The token IS the credential for the public review page, the same
-- way tournament/hosted-event invite tokens work, so the table is only
-- ever touched by the service role through edge functions -- no RLS
-- policies for anon/authenticated beyond the owner's read-only view.
create table public.coach_hours_signoffs (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles(id) on delete cascade,
  period_month date not null check (extract(day from period_month) = 1),
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  status text not null default 'pending' check (status in ('pending', 'signed_off', 'edits_requested')),
  total_hours numeric(6,2),
  coach_note text check (coach_note is null or length(coach_note) <= 2000),
  sent_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (coach_id, period_month)
);
create index coach_hours_signoffs_period_idx on public.coach_hours_signoffs (period_month desc);

alter table public.coach_hours_signoffs enable row level security;

create policy "Owners view hours sign-offs"
  on public.coach_hours_signoffs for select
  to authenticated
  using (public.current_user_role() = 'owner');

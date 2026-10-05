-- "Other reimbursement" lines added to a coach's monthly pay (mileage,
-- supplies, entry fees paid out of pocket...). Entered by the Manager on
-- Coach Pay; the coach can see their own.
create table if not exists public.coach_reimbursements (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles(id) on delete cascade,
  reimb_date date not null,
  amount_cents integer not null check (amount_cents > 0),
  description text not null check (length(description) between 1 and 500),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists coach_reimbursements_coach_date on public.coach_reimbursements (coach_id, reimb_date);
alter table public.coach_reimbursements enable row level security;
create policy "Owners manage reimbursements" on public.coach_reimbursements
  for all to authenticated
  using (current_user_role() = 'owner')
  with check (current_user_role() = 'owner');
create policy "Coaches view their own reimbursements" on public.coach_reimbursements
  for select to authenticated
  using (coach_id = (select auth.uid()));

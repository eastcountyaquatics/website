-- Effective-dated hourly rates. When the Manager changes a coach's rate,
-- they pick the date it takes effect (today, or backfilled to an earlier
-- date); Coach Pay then pays each session at the rate in effect on that
-- session's date. coach_pay_rates stays as the "current rate" for display.
create table if not exists public.coach_rate_history (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles(id) on delete cascade,
  effective_from date not null,
  hourly_rate_cents integer not null check (hourly_rate_cents >= 0),
  created_at timestamptz not null default now(),
  unique (coach_id, effective_from)
);
alter table public.coach_rate_history enable row level security;
create policy "Owners manage rate history" on public.coach_rate_history
  for all to authenticated
  using (current_user_role() = 'owner')
  with check (current_user_role() = 'owner');
create policy "Coaches view their own rate history" on public.coach_rate_history
  for select to authenticated
  using (coach_id = (select auth.uid()));

-- Every existing rate becomes the starting point of its coach's history,
-- so nothing already logged changes.
insert into public.coach_rate_history (coach_id, effective_from, hourly_rate_cents)
select coach_id, date '2000-01-01', hourly_rate_cents from public.coach_pay_rates
on conflict (coach_id, effective_from) do nothing;

-- A rate carried over from a coach record at sign-up also starts history.
create or replace function public.carry_coach_record_rate()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.profile_id is not null
     and (tg_op = 'INSERT' or old.profile_id is distinct from new.profile_id) then
    insert into public.coach_pay_rates (coach_id, hourly_rate_cents)
    select new.profile_id, r.hourly_rate_cents
    from public.coach_record_rates r
    where r.coach_record_id = new.id
    on conflict (coach_id) do nothing;

    insert into public.coach_rate_history (coach_id, effective_from, hourly_rate_cents)
    select new.profile_id, date '2000-01-01', r.hourly_rate_cents
    from public.coach_record_rates r
    where r.coach_record_id = new.id
    on conflict (coach_id, effective_from) do nothing;
  end if;
  return new;
end;
$$;

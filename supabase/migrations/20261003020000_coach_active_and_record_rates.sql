-- 1) Archive coaches who are no longer active without losing their record,
--    and bring them back if they return. Inactive coaches are hidden from
--    the public site but kept in Admin > Coaches.
alter table public.coaches add column if not exists is_active boolean not null default true;

-- 2) Hourly rate stored on the coach record itself, for coaches who don't
--    have a website login yet (coach_pay_rates is keyed by login). Manager
--    only -- never readable by the public, unlike the coaches table.
create table if not exists public.coach_record_rates (
  coach_record_id uuid primary key references public.coaches(id) on delete cascade,
  hourly_rate_cents integer not null check (hourly_rate_cents >= 0),
  updated_at timestamptz not null default now()
);
alter table public.coach_record_rates enable row level security;
create policy "Owners manage coach record rates" on public.coach_record_rates
  for all to authenticated
  using (current_user_role() = 'owner')
  with check (current_user_role() = 'owner');

-- When a coach record gets linked to a login (they signed up), carry the
-- stored rate over to coach_pay_rates so Coach Pay picks it up -- unless
-- that login already has its own rate.
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
  end if;
  return new;
end;
$$;

create trigger coaches_carry_record_rate
  after insert or update of profile_id on public.coaches
  for each row execute function public.carry_coach_record_rate();

-- Family credits: money ECA owes a family (e.g. missed sessions, overpayment,
-- injury), and every time some of it is used up ("issued") — applied to a
-- registration, given as a coupon code, refunded, etc. Owners only.

create table if not exists public.family_credits (
  id uuid primary key default gen_random_uuid(),
  family_name text not null check (length(family_name) between 1 and 200),
  athlete_name text check (athlete_name is null or length(athlete_name) <= 200),
  email text check (email is null or length(email) <= 320),
  amount numeric(10,2) not null check (amount > 0),
  reason text check (reason is null or length(reason) <= 2000),
  credit_date date not null default current_date,
  expires_on date,
  voided boolean not null default false,
  notes text check (notes is null or length(notes) <= 2000),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.family_credit_uses (
  id uuid primary key default gen_random_uuid(),
  credit_id uuid not null references public.family_credits(id) on delete cascade,
  amount numeric(10,2) not null check (amount > 0),
  issued_on date not null default current_date,
  method text not null default 'Applied to registration' check (length(method) <= 100),
  note text check (note is null or length(note) <= 1000),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists family_credit_uses_credit_idx on public.family_credit_uses (credit_id);

alter table public.family_credits enable row level security;
alter table public.family_credit_uses enable row level security;

create policy "Owners manage family credits" on public.family_credits
  for all to authenticated
  using (public.current_user_role() = 'owner')
  with check (public.current_user_role() = 'owner');

create policy "Owners manage family credit uses" on public.family_credit_uses
  for all to authenticated
  using (public.current_user_role() = 'owner')
  with check (public.current_user_role() = 'owner');

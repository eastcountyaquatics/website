-- Add role to profiles first (function below references it).
alter table public.profiles
  add column role text check (role in ('owner', 'coach', 'staff'));

-- Helper: get the calling user's role without triggering RLS recursion on profiles.
create or replace function public.current_user_role()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select role from public.profiles where id = auth.uid();
$$;

revoke execute on function public.current_user_role() from public, anon;
grant execute on function public.current_user_role() to authenticated;

-- Owners can see and manage every profile (existing self-only policies stay in place and combine via OR).
create policy "Owners can view all profiles"
  on public.profiles for select
  using (public.current_user_role() = 'owner');

create policy "Owners can update all profiles"
  on public.profiles for update
  using (public.current_user_role() = 'owner')
  with check (public.current_user_role() = 'owner');

-- Coaches table.
create table public.coaches (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  role_title text,
  team_group text,
  bio text,
  photo_url text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.coaches enable row level security;

create policy "Public can view coaches"
  on public.coaches for select
  using (true);

create policy "Owners and coaches can insert coaches"
  on public.coaches for insert
  with check (public.current_user_role() in ('owner', 'coach'));

create policy "Owners and coaches can update coaches"
  on public.coaches for update
  using (public.current_user_role() in ('owner', 'coach'))
  with check (public.current_user_role() in ('owner', 'coach'));

create policy "Owners and coaches can delete coaches"
  on public.coaches for delete
  using (public.current_user_role() in ('owner', 'coach'));

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger coaches_set_updated_at
  before update on public.coaches
  for each row execute function public.set_updated_at();

-- Seed the current real roster.
insert into public.coaches (full_name, role_title, team_group, sort_order, photo_url) values
  ('Clint McLaughlin', 'Club Founder', 'Club Founders', 1, 'images/coach-marcy.jpg'),
  ('Marcy McLaughlin (Wilson)', 'Club Founder', 'Club Founders', 2, 'images/coach-marcy.jpg'),
  ('Melina Raymond', 'Coach', '8U & 10U Coed & 12U Boys', 1, null),
  ('Evy McColluch', 'Coach', '8U & 10U Coed & 12U Boys', 2, null),
  ('Briana Reynolds', 'Coach', '8U & 10U Coed & 12U Boys', 3, null),
  ('Alessandro Maria Prete', 'Coach', '14U Boys', 1, null),
  ('Preston Burke', 'Masters Team Manager & Coach', '14U Boys', 2, 'images/coach-preston.jpg'),
  ('Joey Asaro', 'Coach', '14U Boys', 3, null),
  ('Naja Steward', 'Coach', '12U / 14U Girls', 1, null),
  ('Kaya Eaton', 'Coach', '12U / 14U Girls', 2, null),
  ('TC Cole', 'Coach', '16U / 18U Girls', 1, null),
  ('Jesse Norton', 'Coach', '16U / 18U Girls', 2, null);

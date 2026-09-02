-- Registration + payments schema for the athlete signup / Stripe flow.
-- Apply via Supabase MCP apply_migration (or `supabase db push` if the CLI
-- is ever hooked up locally). Depends on the earlier migration that added
-- public.profiles.role and public.current_user_role().

-- Athletes (children) belonging to a parent account.
create table public.athletes (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.profiles(id) on delete cascade,
  full_name text not null,
  birthdate date,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.athletes enable row level security;

create policy "Parents manage their own athletes"
  on public.athletes for all
  using (auth.uid() = parent_id)
  with check (auth.uid() = parent_id);

create policy "Owners can view all athletes"
  on public.athletes for select
  using (public.current_user_role() = 'owner');

-- Registration options ("Stripe codes") — one per team/season offering.
create table public.registration_options (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  description text,
  stripe_price_id text not null,
  amount_cents int not null,
  season text,
  is_open boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.registration_options enable row level security;

create policy "Anyone can view open registration options"
  on public.registration_options for select
  using (is_open = true);

create policy "Owners can view all registration options"
  on public.registration_options for select
  using (public.current_user_role() = 'owner');

create policy "Owners can insert registration options"
  on public.registration_options for insert
  with check (public.current_user_role() = 'owner');

create policy "Owners can update registration options"
  on public.registration_options for update
  using (public.current_user_role() = 'owner')
  with check (public.current_user_role() = 'owner');

create policy "Owners can delete registration options"
  on public.registration_options for delete
  using (public.current_user_role() = 'owner');

create trigger registration_options_set_updated_at
  before update on public.registration_options
  for each row execute function public.set_updated_at();

-- Link purchases to a specific athlete and registration option.
-- Inserts happen only from the stripe-webhook Edge Function using the
-- service role key (bypasses RLS), so no public insert policy is added --
-- a browser client should never be able to write its own "purchase".
alter table public.purchases
  add column athlete_id uuid references public.athletes(id) on delete set null,
  add column registration_option_id uuid references public.registration_options(id) on delete set null;

-- Owners need to see every purchase for the admin Sign-Ups view / CSV export
-- (previously purchases only had a self-select policy for the buyer).
create policy "Owners can view all purchases"
  on public.purchases for select
  using (public.current_user_role() = 'owner');

-- Team practice schedules, editable by owner or coach, publish/unpublish
-- toggle controls whether the public team pages show it yet.
create table public.schedules (
  id uuid primary key default gen_random_uuid(),
  team_slug text not null unique,
  team_label text not null,
  season_label text,
  date_range text,
  requirements text,
  practice_lines jsonb not null default '[]'::jsonb,
  notes jsonb not null default '[]'::jsonb,
  is_published boolean not null default false,
  sort_order int not null default 0,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.schedules enable row level security;

create policy "Anyone can view published schedules"
  on public.schedules for select
  using (is_published = true);

create policy "Owners and coaches can view all schedules"
  on public.schedules for select
  using (public.current_user_role() in ('owner', 'coach'));

create policy "Owners and coaches can insert schedules"
  on public.schedules for insert
  with check (public.current_user_role() in ('owner', 'coach'));

create policy "Owners and coaches can update schedules"
  on public.schedules for update
  using (public.current_user_role() in ('owner', 'coach'))
  with check (public.current_user_role() in ('owner', 'coach'));

create policy "Owners and coaches can delete schedules"
  on public.schedules for delete
  using (public.current_user_role() in ('owner', 'coach'));

create trigger schedules_set_updated_at
  before update on public.schedules
  for each row execute function public.set_updated_at();

-- Seed one row per real team page so the admin list has something to edit
-- from day one, matching the slugs used by team-*.html. Left unpublished
-- until a coach/owner reviews and turns each one on.
insert into public.schedules (team_slug, team_label, sort_order) values
  ('splashball', 'Splashball', 1),
  ('8u-coed', '8U Coed', 2),
  ('10u-coed', '10U Coed', 3),
  ('12u-boys', '12U Boys', 4),
  ('12u-girls', '12U Girls', 5),
  ('14u-boys', '14U Boys', 6),
  ('14u-girls', '14U Girls', 7),
  ('16u-boys', '16U Boys', 8),
  ('16u-girls', '16U Girls', 9),
  ('18u-boys', '18U Boys', 10),
  ('18u-girls', '18U Girls', 11);

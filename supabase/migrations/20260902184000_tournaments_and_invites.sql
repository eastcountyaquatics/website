-- A no-login invite-link payment has no authenticated user to attach the
-- purchase to, so user_id can no longer be mandatory. Existing rows are
-- unaffected; RLS's "auth.uid() = user_id" just never matches a null, so
-- these stay invisible to any parent dashboard and visible only to
-- owner/accountant, which is correct for an unauthenticated payment.
alter table public.purchases
  alter column user_id drop not null,
  add column tournament_id uuid,
  add column tournament_invite_id uuid,
  add column payer_name text,
  add column payer_email text;

create table public.tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  event_date date not null,
  description text,
  requirements text,
  shirt_size_enabled boolean not null default false,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tournaments enable row level security;

create policy "Anyone can view published tournaments"
  on public.tournaments for select using (is_published = true);
create policy "Owners and coaches can view all tournaments"
  on public.tournaments for select using (public.current_user_role() in ('owner', 'coach'));
create policy "Owners and coaches can insert tournaments"
  on public.tournaments for insert with check (public.current_user_role() in ('owner', 'coach'));
create policy "Owners and coaches can update tournaments"
  on public.tournaments for update
  using (public.current_user_role() in ('owner', 'coach'))
  with check (public.current_user_role() in ('owner', 'coach'));
create policy "Owners and coaches can delete tournaments"
  on public.tournaments for delete using (public.current_user_role() in ('owner', 'coach'));

create trigger tournaments_set_updated_at
  before update on public.tournaments
  for each row execute function public.set_updated_at();

-- Price tiers: age/gender bracket -> a fixed dollar amount. Matched
-- server-side at invite time using age as of the tournament's event_date
-- (not the Aug-1 season-eligibility rule used for team placement --
-- tournament age cutoffs run off the actual event date).
create table public.tournament_price_tiers (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  label text not null,
  min_age int,
  max_age int,
  gender text check (gender in ('Male', 'Female')),
  amount_cents int not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.tournament_price_tiers enable row level security;

create policy "Anyone can view tiers of published tournaments"
  on public.tournament_price_tiers for select
  using (exists (select 1 from public.tournaments t where t.id = tournament_id and t.is_published));
create policy "Owners and coaches can view all tiers"
  on public.tournament_price_tiers for select
  using (public.current_user_role() in ('owner', 'coach'));
create policy "Owners and coaches can insert tiers"
  on public.tournament_price_tiers for insert
  with check (public.current_user_role() in ('owner', 'coach'));
create policy "Owners and coaches can update tiers"
  on public.tournament_price_tiers for update
  using (public.current_user_role() in ('owner', 'coach'))
  with check (public.current_user_role() in ('owner', 'coach'));
create policy "Owners and coaches can delete tiers"
  on public.tournament_price_tiers for delete
  using (public.current_user_role() in ('owner', 'coach'));

-- Invite-only enrollment: a per-athlete unique link, no login required.
-- Deliberately has no public/anon select policy -- the token is only ever
-- resolved through the get-tournament-invite edge function (service
-- role), so a browser can never enumerate other invitees or tournaments
-- by guessing at the table directly.
create table public.tournament_invites (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  status text not null default 'pending' check (status in ('pending', 'paid', 'cancelled')),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

alter table public.tournament_invites enable row level security;

create policy "Owners and coaches manage tournament invites"
  on public.tournament_invites for all
  using (public.current_user_role() in ('owner', 'coach'))
  with check (public.current_user_role() in ('owner', 'coach'));

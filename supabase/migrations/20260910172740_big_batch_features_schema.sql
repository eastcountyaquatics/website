-- ============================================================================
-- Large batch of feature requests in one consolidated schema migration.
-- Each section is independent; grouped together for one deploy pass.
-- ============================================================================

-- ---- 1. Coach hourly pay rate -------------------------------------------
-- Deliberately NOT on the public `coaches` table (that table is read by the
-- public roster page and now the contact form's recipient list -- adding a
-- pay rate column there would leak it to anyone). Separate table, RLS-only
-- access: an owner sees/sets every rate; a coach sees only their own (so
-- they can see their own pay math on the Hours report) and can never set it.
create table if not exists public.coach_pay_rates (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null unique references public.profiles(id) on delete cascade,
  hourly_rate_cents integer not null check (hourly_rate_cents >= 0),
  updated_at timestamptz not null default now()
);

alter table public.coach_pay_rates enable row level security;

create policy "Owners manage all pay rates"
  on public.coach_pay_rates for all
  to authenticated
  using (public.current_user_role() = 'owner')
  with check (public.current_user_role() = 'owner');

create policy "Coaches view their own pay rate"
  on public.coach_pay_rates for select
  to authenticated
  using (coach_id = (select auth.uid()));

create trigger coach_pay_rates_set_updated_at
  before update on public.coach_pay_rates
  for each row execute function public.set_updated_at();

-- ---- 2. coach_hours: broaden so one coach can log hours for another -----
-- The roll-call screen now lets whoever takes attendance log hours for any
-- coach who was actually present (a head coach logging an assistant's
-- hours), not only their own. That needs write access beyond "my own row",
-- and read access to see what has already been logged for the session being
-- edited. Small clubs where every coach already sees each other day-to-day
-- in person; this trades a slice of pay-hours privacy between coaches for a
-- workable shared logging UI. Rates themselves (previous section) stay
-- strictly private per-coach/owner regardless of this change.
drop policy if exists "Coaches manage their own hours" on public.coach_hours;
drop policy if exists "Coaches insert their own hours" on public.coach_hours;
drop policy if exists "Coaches update their own hours" on public.coach_hours;
drop policy if exists "Coaches delete their own hours" on public.coach_hours;

create policy "Coaches and owners view all coach hours"
  on public.coach_hours for select
  to authenticated
  using (public.current_user_role() in ('owner', 'coach'));

create policy "Coaches and owners insert coach hours"
  on public.coach_hours for insert
  to authenticated
  with check (public.current_user_role() in ('owner', 'coach'));

create policy "Coaches and owners update coach hours"
  on public.coach_hours for update
  to authenticated
  using (public.current_user_role() in ('owner', 'coach'))
  with check (public.current_user_role() in ('owner', 'coach'));

create policy "Coaches and owners delete coach hours"
  on public.coach_hours for delete
  to authenticated
  using (public.current_user_role() in ('owner', 'coach'));

-- The old owner-only "view/correct/delete all" policies duplicate the above
-- (owner is already covered by "in ('owner','coach')"); drop the redundant
-- ones flagged by the Supabase advisor as multiple-permissive.
drop policy if exists "Owners view all coach hours" on public.coach_hours;
drop policy if exists "Owners correct any coach hours" on public.coach_hours;
drop policy if exists "Owners delete any coach hours" on public.coach_hours;

-- ---- 3. Registration options: multiple teams instead of one -------------
-- team_slug was purely a display/organizing label (verified: nothing filters
-- what a parent sees by it), so widening it to an array is safe -- no
-- parent-facing behavior depends on it. "masters" is not a real schedules
-- row, so it is allowed here as a plain tag value alongside real team slugs.
alter table public.registration_options
  add column if not exists team_slugs text[] not null default '{}';

update public.registration_options
  set team_slugs = array[team_slug]
  where team_slug is not null and team_slug <> '' and team_slugs = '{}';

-- ---- 4. Tournaments: location + optional hotel ---------------------------
alter table public.tournaments
  add column if not exists location text,
  add column if not exists hotel_name text,
  add column if not exists hotel_url text;

-- ---- 5. Team interest / call-for-interest announcements ------------------
-- Generalized, payment-free version of the tournament RSVP idea: a coach
-- posts "are you interested in X", parents mark yes/no per athlete.
create table if not exists public.team_announcements (
  id uuid primary key default gen_random_uuid(),
  team_slug text not null,
  title text not null check (length(title) <= 200),
  body text check (body is null or length(body) <= 2000),
  deadline date,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  archived boolean not null default false
);

create table if not exists public.team_announcement_responses (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.team_announcements(id) on delete cascade,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  response text not null check (response in ('interested', 'not_interested')),
  responded_at timestamptz not null default now(),
  unique (announcement_id, athlete_id)
);

create index if not exists team_announcements_team_idx
  on public.team_announcements (team_slug, archived, created_at desc);
create index if not exists team_announcement_responses_announcement_idx
  on public.team_announcement_responses (announcement_id);
create index if not exists team_announcement_responses_athlete_idx
  on public.team_announcement_responses (athlete_id);

alter table public.team_announcements enable row level security;
alter table public.team_announcement_responses enable row level security;

create policy "Owners and coaches manage announcements"
  on public.team_announcements for all
  to authenticated
  using (public.current_user_role() in ('owner', 'coach'))
  with check (public.current_user_role() in ('owner', 'coach'));

create policy "Parents view announcements for their athletes' team"
  on public.team_announcements for select
  to authenticated
  using (exists (
    select 1 from public.athletes a
    where a.parent_id = (select auth.uid())
      and a.team_slug = team_announcements.team_slug
  ));

create policy "Owners and coaches manage all responses"
  on public.team_announcement_responses for all
  to authenticated
  using (public.current_user_role() in ('owner', 'coach'))
  with check (public.current_user_role() in ('owner', 'coach'));

create policy "Parents manage responses for their own athletes"
  on public.team_announcement_responses for all
  to authenticated
  using (exists (
    select 1 from public.athletes a
    where a.id = team_announcement_responses.athlete_id
      and a.parent_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.athletes a
    where a.id = team_announcement_responses.athlete_id
      and a.parent_id = (select auth.uid())
  ));

-- ---- 6. Pages: allow parents to see tournament-payment receipts too -----
-- purchases already lets a signed-in user see rows where user_id = them.
-- Tournament payments never have a user_id (paid without logging in), so a
-- parent's own tournament receipts were invisible on their own dashboard.
-- Tie visibility to athlete ownership instead, additively.
create policy "Parents view purchases for their own athletes"
  on public.purchases for select
  to authenticated
  using (exists (
    select 1 from public.athletes a
    where a.id = purchases.athlete_id
      and a.parent_id = (select auth.uid())
  ));

-- ---- 7. Sponsorships -----------------------------------------------------
create table if not exists public.sponsorships (
  id uuid primary key default gen_random_uuid(),
  company_name text not null check (length(company_name) <= 200),
  contact_name text check (contact_name is null or length(contact_name) <= 200),
  contact_email text not null check (length(contact_email) <= 200),
  contact_phone text check (contact_phone is null or length(contact_phone) <= 40),
  tier text check (tier is null or length(tier) <= 80),
  amount_cents integer not null check (amount_cents > 0),
  website_url text check (website_url is null or length(website_url) <= 500),
  logo_url text check (logo_url is null or length(logo_url) <= 500),
  blurb text check (blurb is null or length(blurb) <= 2000),
  status text not null default 'pending' check (status in ('pending', 'paid')),
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create unique index if not exists sponsorships_session_dedupe
  on public.sponsorships (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

alter table public.sponsorships enable row level security;

-- Anyone may submit a sponsorship inquiry -- the form is public, matching
-- the pattern already used for the contact form.
create policy "Anyone can submit a sponsorship inquiry"
  on public.sponsorships for insert
  to anon, authenticated
  with check (status = 'pending' and stripe_checkout_session_id is null);

create policy "Owners and accountants manage sponsorships"
  on public.sponsorships for all
  to authenticated
  using (public.current_user_role() in ('owner', 'accountant'))
  with check (public.current_user_role() in ('owner', 'accountant'));

-- A sponsor filling the form must not be able to mark their own submission
-- paid or rewrite it after the fact; only the webhook (service role) and an
-- owner/accountant may change it.
create or replace function public.guard_sponsorship_update()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null or public.current_user_role() in ('owner', 'accountant') then
    return new;
  end if;
  raise exception 'Sponsorship submissions cannot be edited after they are sent';
end;
$$;

revoke execute on function public.guard_sponsorship_update() from public, anon, authenticated;

create trigger sponsorships_guard_update
  before update on public.sponsorships
  for each row execute function public.guard_sponsorship_update();

-- ---- 8. Hosted tournaments / scrimmages (outside teams pay to attend) ---
create table if not exists public.hosted_events (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) <= 200),
  event_date date not null,
  level text check (level is null or length(level) <= 120),
  description text check (description is null or length(description) <= 2000),
  location text check (location is null or length(location) <= 300),
  hotel_name text check (hotel_name is null or length(hotel_name) <= 200),
  hotel_url text check (hotel_url is null or length(hotel_url) <= 500),
  fee_cents integer not null check (fee_cents > 0),
  max_teams integer check (max_teams is null or max_teams > 0),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.hosted_event_invites (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.hosted_events(id) on delete cascade,
  team_name text not null check (length(team_name) <= 200),
  contact_name text check (contact_name is null or length(contact_name) <= 200),
  contact_email text not null check (length(contact_email) <= 200),
  contact_phone text check (contact_phone is null or length(contact_phone) <= 40),
  -- Deliberately no public/anon select policy below -- same pattern as
  -- tournament_invites: the random token is what protects this, accessed
  -- only through an Edge Function using the service role.
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  status text not null default 'invited' check (status in ('invited', 'paid')),
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists hosted_event_invites_event_idx
  on public.hosted_event_invites (event_id);

alter table public.hosted_events enable row level security;
alter table public.hosted_event_invites enable row level security;

create policy "Owners and coaches manage hosted events"
  on public.hosted_events for all
  to authenticated
  using (public.current_user_role() in ('owner', 'coach'))
  with check (public.current_user_role() in ('owner', 'coach'));

create policy "Owners and coaches manage hosted event invites"
  on public.hosted_event_invites for all
  to authenticated
  using (public.current_user_role() in ('owner', 'coach'))
  with check (public.current_user_role() in ('owner', 'coach'));

-- purchases: trace a hosted-event fee back to its invite, and make a
-- duplicate delivery of that payment impossible, same idempotency pattern
-- just added for the other three payment paths.
alter table public.purchases
  add column if not exists hosted_event_invite_id uuid references public.hosted_event_invites(id) on delete set null;

create unique index if not exists purchases_hosted_event_dedupe
  on public.purchases (hosted_event_invite_id)
  where hosted_event_invite_id is not null;


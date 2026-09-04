-- Masters is a separate billing model from team registration: a member
-- pays themselves (there's no "athlete" record — the adult player is the
-- account holder), on a recurring monthly subscription they can pause
-- anytime, priced by a 25-and-under vs 26+ age bracket rather than a
-- one-time Stripe Checkout charge. The existing $13 pay-to-play option
-- from masters.html stays a plain one-time registration_options row --
-- it doesn't need any of this.
create table public.masters_price_tiers (
  id uuid primary key default gen_random_uuid(),
  tier text not null unique check (tier in ('25_under', '26_plus')),
  label text not null,
  amount_cents int not null,
  stripe_price_id text,
  stripe_product_id text,
  updated_at timestamptz not null default now()
);

alter table public.masters_price_tiers enable row level security;

-- Pricing itself isn't sensitive -- same "anyone can view" treatment as
-- registration_options -- but only an owner can set it, since it drives
-- real Stripe Price creation.
create policy "Anyone can view masters price tiers"
  on public.masters_price_tiers for select using (true);
create policy "Owners can insert masters price tiers"
  on public.masters_price_tiers for insert with check (public.current_user_role() = 'owner');
create policy "Owners can update masters price tiers"
  on public.masters_price_tiers for update
  using (public.current_user_role() = 'owner')
  with check (public.current_user_role() = 'owner');

create trigger masters_price_tiers_set_updated_at
  before update on public.masters_price_tiers
  for each row execute function public.set_updated_at();

create table public.masters_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  tier text not null check (tier in ('25_under', '26_plus')),
  stripe_customer_id text,
  stripe_subscription_id text unique,
  -- pending: checkout started but not yet confirmed by the webhook.
  -- active/paused/past_due/canceled mirror the underlying Stripe
  -- subscription status -- Stripe is the source of truth, this is a
  -- read-friendly mirror of it for the dashboard and admin view.
  status text not null default 'pending' check (status in ('pending', 'active', 'paused', 'past_due', 'canceled')),
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.masters_subscriptions enable row level security;

create policy "Members can view their own masters subscription"
  on public.masters_subscriptions for select using (auth.uid() = user_id);
create policy "Owners and accountants can view all masters subscriptions"
  on public.masters_subscriptions for select
  using (public.current_user_role() in ('owner', 'accountant'));

-- Deliberately no insert/update policy for regular users -- rows are only
-- ever written by the create-masters-subscription and stripe-webhook edge
-- functions (service role), which bypasses RLS. A member changes their
-- subscription only by calling manage-masters-subscription, never by
-- writing this table directly.

create trigger masters_subscriptions_set_updated_at
  before update on public.masters_subscriptions
  for each row execute function public.set_updated_at();

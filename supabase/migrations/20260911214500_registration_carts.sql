-- create-checkout-session was cramming the whole cart (athlete_id,
-- athlete_name, registration_option_id, registration_label per item) into
-- a single Stripe checkout session metadata value as JSON. Stripe caps a
-- metadata value at 500 characters -- with real label/name lengths already
-- in production, three athletes registered in the same checkout already
-- exceeds that, and the whole session.create() call fails outright, so a
-- family registering multiple kids together (the exact case the "sibling"
-- discount code exists for) could not check out at all.
--
-- Fix: store the cart server-side and pass only its id in metadata. The
-- webhook (service role) reads the cart back by id -- no size limit there.
create table public.registration_carts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  items jsonb not null,
  consent jsonb,
  created_at timestamptz not null default now()
);

alter table public.registration_carts enable row level security;

-- Created by create-checkout-session using the caller's own JWT, right
-- before creating the Stripe session. Never read back by the browser --
-- the webhook (service role, bypasses RLS) is the only reader -- so no
-- select policy is needed for normal use, only an owner escape hatch for
-- support/debugging.
create policy "Users can create their own registration carts"
  on public.registration_carts for insert
  with check (auth.uid() = user_id);

create policy "Owners can view registration carts"
  on public.registration_carts for select
  using (current_user_role() = 'owner');

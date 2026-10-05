-- Small key/value store for site-wide settings the Manager controls
-- (first use: the Age Division Calculator's tournament year).
create table if not exists public.site_settings (
  key text primary key check (length(key) between 1 and 100),
  value jsonb,
  updated_at timestamptz not null default now()
);
alter table public.site_settings enable row level security;
create policy "Anyone can read site settings" on public.site_settings
  for select using (true);
create policy "Owners manage site settings" on public.site_settings
  for all to authenticated
  using (current_user_role() = 'owner')
  with check (current_user_role() = 'owner');

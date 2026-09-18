-- Saved pool locations (item 29), searchable/reusable across every team's
-- schedule instead of retyping an address every time. Public read: the
-- public team pages show the address + directions links alongside each
-- practice entry, same as the schedule itself is already public once
-- published.
create table public.pool_locations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) <= 200),
  address text not null check (length(address) <= 300),
  created_at timestamptz not null default now()
);
create unique index pool_locations_name_idx on public.pool_locations (lower(name));

alter table public.pool_locations enable row level security;

create policy "Anyone can view pool locations"
  on public.pool_locations for select
  to public
  using (true);

create policy "Owners and coaches manage pool locations"
  on public.pool_locations for all
  to authenticated
  using (public.current_user_role() in ('owner', 'coach'))
  with check (public.current_user_role() in ('owner', 'coach'));

-- Pre-populated with the club's actual practice pools. Montgomery Pool /
-- 1570 Melody Ln. is deliberately NOT included -- per instruction, that
-- location is no longer in use and should not be re-added.
insert into public.pool_locations (name, address) values
  ('El Cajon Pool', '1035 Madison Avenue, El Cajon, CA'),
  ('El Capitan Pool', '10410 Ashwood St., Lakeside, CA'),
  ('Granite Hills Pool', '1719 E. Madison Ave., El Cajon, CA'),
  ('Grossmont Pool', '1100 Murray Drive, El Cajon, CA'),
  ('Helix Pool', '7323 University Ave., La Mesa, CA'),
  ('Monte Vista Pool', '3230 Sweetwater Spring Blvd., Spring Valley, CA'),
  ('Mount Miguel Pool', '8585 Blossom Ln., Spring Valley, CA'),
  ('Santana Pool', '9915 Magnolia, Santee, CA'),
  ('West Hills Pool', '8756 Mast Blvd., Santee, CA'),
  ('Valhalla Pool', '1725 Hillsdale Rd., El Cajon, CA'),
  ('Steele Canyon', '12440 Campo Rd., Spring Valley, CA'),
  ('Montgomery Middle School', '2470 Ulric St, San Diego, CA 92111')
on conflict do nothing;

create table if not exists public.band_links (
  team_slug text primary key,
  label text not null,
  url text,
  updated_at timestamptz not null default now()
);

alter table public.band_links enable row level security;

create policy "Anyone can view band links"
  on public.band_links for select
  using (true);

create policy "Owners and coaches manage band links"
  on public.band_links for all
  using (current_user_role() = any (array['owner', 'coach']))
  with check (current_user_role() = any (array['owner', 'coach']));

insert into public.band_links (team_slug, label, url) values
  ('8u-coed', '8U Team', 'https://band.us/n/acafb1I3R3ydc'),
  ('10u-coed', '10U Team', 'https://band.us/n/a1aeA1bfmaU8C'),
  ('12u-boys', '12U CoEd', 'https://band.us/n/aba8b5FfW1H5S'),
  ('12u-girls', '12U CoEd', 'https://band.us/n/aba8b5FfW1H5S'),
  ('14u-boys', '14U Boys', 'https://band.us/n/a8a8b6rbdch72'),
  ('14u-girls', '14U Girls', 'https://band.us/n/a8a7b7Icy8H7I'),
  ('16u-boys', '16U Boys', null),
  ('16u-girls', 'HS Girls', 'https://band.us/n/a0a7bcXcl2R1R'),
  ('18u-boys', '18U Boys', null),
  ('18u-girls', 'HS Girls', 'https://band.us/n/a0a7bcXcl2R1R'),
  ('splashball', 'Splashball', null)
on conflict (team_slug) do nothing;

-- Photo Library: owners upload photos into a PRIVATE review area, approve the
-- ones that may be shown publicly, and only approved photos are copied to a
-- public bucket. Nothing is public until an owner approves it, so a batch of
-- team photos can be uploaded and checked (consent, quality, who's in them)
-- before anyone outside the club can see a single one.
--
--   photos-review   private: owners only (thumbnails shown via signed links)
--   photos-public   public:  the approved photos, copied here on approval
--   photo_library   one row per photo: team, album, caption, status
create table if not exists public.photo_library (
  id uuid primary key default gen_random_uuid(),
  sha256 text not null unique check (sha256 ~ '^[0-9a-f]{64}$'),
  path text not null unique check (length(path) <= 300),
  thumb_path text not null check (length(thumb_path) <= 300),
  team_slug text check (team_slug is null or length(team_slug) <= 60),
  album text check (album is null or length(album) <= 120),
  taken_label text check (taken_label is null or length(taken_label) <= 80),
  caption text check (caption is null or length(caption) <= 300),
  alt text check (alt is null or length(alt) <= 300),
  status text not null default 'review' check (status in ('review', 'approved', 'hidden')),
  featured boolean not null default false,
  width int,
  height int,
  source jsonb not null default '{}'::jsonb,
  public_url text check (public_url is null or public_url ~ '^https://'),
  public_thumb_url text check (public_thumb_url is null or public_thumb_url ~ '^https://'),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A photo can only be approved with its public addresses in place.
  constraint approved_has_urls check (status <> 'approved' or (public_url is not null and public_thumb_url is not null))
);

create index if not exists photo_library_status_idx on public.photo_library (status, team_slug);

alter table public.photo_library enable row level security;

-- Visitors see approved photos only; owners see and manage everything.
create policy "Anyone can see approved photos" on public.photo_library
  for select to anon, authenticated
  using (status = 'approved');

create policy "Owners manage the photo library" on public.photo_library
  for all to authenticated
  using (public.current_user_role() = 'owner')
  with check (public.current_user_role() = 'owner');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos-review', 'photos-review', false, 5242880, array['image/jpeg', 'image/webp', 'image/png'])
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos-public', 'photos-public', true, 5242880, array['image/jpeg', 'image/webp', 'image/png'])
on conflict (id) do nothing;

-- Review area: owners only, for everything. (A private bucket serves nothing
-- to anyone without a policy that allows it.)
create policy "Owners read review photos" on storage.objects
  for select to authenticated
  using (bucket_id = 'photos-review' and public.current_user_role() = 'owner');
create policy "Owners add review photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'photos-review' and public.current_user_role() = 'owner');
create policy "Owners replace review photos" on storage.objects
  for update to authenticated
  using (bucket_id = 'photos-review' and public.current_user_role() = 'owner')
  with check (bucket_id = 'photos-review' and public.current_user_role() = 'owner');
create policy "Owners delete review photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'photos-review' and public.current_user_role() = 'owner');

-- Public area: the bucket is public (files are served by address), and only
-- owners can put files in or take them out.
create policy "Owners add public photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'photos-public' and public.current_user_role() = 'owner');
create policy "Owners replace public photos" on storage.objects
  for update to authenticated
  using (bucket_id = 'photos-public' and public.current_user_role() = 'owner')
  with check (bucket_id = 'photos-public' and public.current_user_role() = 'owner');
create policy "Owners delete public photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'photos-public' and public.current_user_role() = 'owner');
create policy "Anyone can view public photos" on storage.objects
  for select to public
  using (bucket_id = 'photos-public');

-- Same idea as content_blocks (text overrides on top of the static page
-- HTML) but for images: an owner picks an <img data-cms-img="key"> on a
-- public page and swaps its src/alt, without touching code. A separate
-- table rather than folding into content_blocks -- an image override is
-- structurally different (a URL + alt text, not innerHTML) and never
-- needs the tag-swap logic content_blocks has.
create table public.image_blocks (
  id uuid primary key default gen_random_uuid(),
  page_path text not null,
  block_key text not null,
  image_url text not null check (length(image_url) <= 2000),
  alt_text text check (alt_text is null or length(alt_text) <= 300),
  updated_at timestamptz not null default now(),
  unique (page_path, block_key)
);

alter table public.image_blocks enable row level security;

create policy "Anyone can read image overrides"
  on public.image_blocks for select
  to public
  using (true);

create policy "Owners manage image overrides"
  on public.image_blocks for all
  to authenticated
  using (public.current_user_role() = 'owner')
  with check (public.current_user_role() = 'owner');

create trigger image_blocks_set_updated_at
  before update on public.image_blocks
  for each row execute function public.set_updated_at();

-- Storage bucket owners upload replacement images into. Public so the
-- live site can load them directly by URL (this mirrors how every other
-- image on the site already works -- a plain public URL, no auth check
-- on read); write access is owner-only via the policies below. Capped at
-- 5MB and image mime types only so this can't become a place to dump
-- arbitrary files.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-images', 'site-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

create policy "Anyone can view site images"
  on storage.objects for select
  to public
  using (bucket_id = 'site-images');

create policy "Owners can upload site images"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'site-images' and public.current_user_role() = 'owner');

create policy "Owners can replace site images"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'site-images' and public.current_user_role() = 'owner')
  with check (bucket_id = 'site-images' and public.current_user_role() = 'owner');

create policy "Owners can delete site images"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'site-images' and public.current_user_role() = 'owner');

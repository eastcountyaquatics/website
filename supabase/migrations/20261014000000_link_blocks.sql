-- Owner-edited buttons and links: the text and where it goes, per page,
-- keyed by the element's data-cms-link. Same pattern as image_blocks.
create table if not exists public.link_blocks (
  page_path text not null,
  block_key text not null,
  label text check (label is null or length(label) <= 120),
  href text check (href is null or length(href) <= 600),
  updated_at timestamptz not null default now(),
  primary key (page_path, block_key)
);

alter table public.link_blocks enable row level security;

create policy "Anyone can read link overrides" on public.link_blocks
  for select using (true);

create policy "Owners manage link overrides" on public.link_blocks
  for all to authenticated
  using (public.current_user_role() = 'owner')
  with check (public.current_user_role() = 'owner');

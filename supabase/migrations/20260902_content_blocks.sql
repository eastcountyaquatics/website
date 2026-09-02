-- Per-block text overrides for the hand-built static pages. The HTML still
-- holds the original wording as the default; a row here only exists once
-- someone has edited that block, and deleting the row reverts it.
create table public.content_blocks (
  block_key text primary key,
  page_path text not null,
  content text not null,
  updated_at timestamptz not null default now()
);

create index content_blocks_page_path_idx on public.content_blocks (page_path);

alter table public.content_blocks enable row level security;

create policy "Anyone can read content blocks"
  on public.content_blocks for select
  using (true);

create policy "Owners manage content blocks"
  on public.content_blocks for all
  using (public.current_user_role() = 'owner')
  with check (public.current_user_role() = 'owner');

create trigger content_blocks_set_updated_at
  before update on public.content_blocks
  for each row execute function public.set_updated_at();

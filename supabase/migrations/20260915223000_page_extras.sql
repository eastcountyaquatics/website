-- Lets an owner append brand-new content (a section, an image, a list --
-- anything the rich editor on admin-content.html can build) to the
-- bottom of an existing static page, right before the footer. Everything
-- else this session built (content_blocks, image_blocks) only lets an
-- owner change something the page already has; this is the piece that
-- lets them add something it doesn't.
--
-- One row per page (page_path is the primary key, not block_key-based
-- like the other two tables) since there's exactly one "extra content"
-- zone per page, not many independently-tracked blocks.
create table public.page_extras (
  page_path text primary key,
  body_html text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.page_extras enable row level security;

create policy "Anyone can read page extras"
  on public.page_extras for select
  to public
  using (true);

create policy "Owners manage page extras"
  on public.page_extras for all
  to authenticated
  using (public.current_user_role() = 'owner')
  with check (public.current_user_role() = 'owner');

create trigger page_extras_set_updated_at
  before update on public.page_extras
  for each row execute function public.set_updated_at();

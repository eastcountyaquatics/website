-- Owner-authored pages for the public site, rendered by page.html?slug=...
-- The hand-built pages (index, teams, about-us, ...) stay as static files;
-- this is for pages the club adds themselves.
create table public.pages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  nav_label text,
  meta_description text,
  body_html text not null default '',
  show_in_nav boolean not null default false,
  sort_order int not null default 0,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.pages enable row level security;

create policy "Anyone can view published pages"
  on public.pages for select
  using (is_published = true);

create policy "Owners can view all pages"
  on public.pages for select
  using (public.current_user_role() = 'owner');

create policy "Owners can insert pages"
  on public.pages for insert
  with check (public.current_user_role() = 'owner');

create policy "Owners can update pages"
  on public.pages for update
  using (public.current_user_role() = 'owner')
  with check (public.current_user_role() = 'owner');

create policy "Owners can delete pages"
  on public.pages for delete
  using (public.current_user_role() = 'owner');

create trigger pages_set_updated_at
  before update on public.pages
  for each row execute function public.set_updated_at();

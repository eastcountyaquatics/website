-- Full layout control in Admin > Edit Website, plus page history.
--
-- page_layouts: the order of a page's sections, which built-in ones are
-- hidden, and the owner-added sections (with their content) placed anywhere
-- between them. One row per page, only once someone has rearranged it;
-- without a row the page shows exactly as built. Built-in sections are
-- identified by their data-section key in the HTML (e.g. "masters-3").
--   sections: [{ "key": "masters-1" },
--              { "key": "masters-2", "hidden": true },
--              { "added": "k3x9", "style": "alt", "html": "<h2>...</h2>" }, ...]
-- Supersedes page_extras for that page (the editor moves any page_extras
-- content into an added section the first time the page is rearranged).
--
-- page_versions: a snapshot of everything saved for a page (text, images,
-- buttons, layout, or a custom page's own content) each editing session, so
-- an owner can restore an earlier version.

create table if not exists public.page_layouts (
  page_path text primary key check (length(page_path) <= 200),
  sections jsonb not null default '[]'::jsonb check (jsonb_typeof(sections) = 'array'),
  updated_at timestamptz not null default now()
);

alter table public.page_layouts enable row level security;

create policy "Anyone can read page layouts" on public.page_layouts
  for select using (true);
create policy "Owners manage page layouts" on public.page_layouts
  for all to authenticated
  using (public.current_user_role() = 'owner')
  with check (public.current_user_role() = 'owner');

create table if not exists public.page_versions (
  id uuid primary key default gen_random_uuid(),
  page_path text not null check (length(page_path) <= 200),
  snapshot jsonb not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists page_versions_page_idx on public.page_versions (page_path, updated_at desc);

alter table public.page_versions enable row level security;

create policy "Owners manage page versions" on public.page_versions
  for all to authenticated
  using (public.current_user_role() = 'owner')
  with check (public.current_user_role() = 'owner');

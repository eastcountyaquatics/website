-- ECA Alumni: a simple public sign-up list (players and parents who want to stay
-- in touch) and a small contact list for owners. Anyone can add themselves;
-- only owners can read, change or delete rows.
create table if not exists public.alumni_contacts (
  id uuid primary key default gen_random_uuid(),
  first_name text not null check (length(btrim(first_name)) between 1 and 100),
  last_name text not null check (length(btrim(last_name)) between 1 and 100),
  email text not null check (length(email) <= 200 and email like '%_@_%'),
  phone text check (phone is null or length(phone) <= 40),
  -- "player", "parent" or "both": lets owners email each group separately.
  segment text not null default 'player' check (segment in ('player', 'parent', 'both')),
  grad_year integer check (grad_year is null or grad_year between 1990 and 2100),
  notes text check (notes is null or length(notes) <= 2000),
  wants_email boolean not null default true,
  source text not null default 'alumni page' check (length(source) <= 60),
  created_at timestamptz not null default now()
);
create unique index if not exists alumni_contacts_email_lower_idx on public.alumni_contacts (lower(email));

alter table public.alumni_contacts enable row level security;

-- The public form can only add a plain new row (no owner-only notes, no custom source).
create policy "Anyone can join the alumni list" on public.alumni_contacts
  for insert to anon, authenticated
  with check (notes is null and source = 'alumni page' and wants_email = true);

create policy "Owners manage alumni contacts" on public.alumni_contacts
  for all to authenticated
  using (public.current_user_role() = 'owner')
  with check (public.current_user_role() = 'owner');

-- Lightweight, reusable contact database for hosted-event team invitations
-- (item 15 of the request): invite Coronado High School once, and their
-- info is there to reuse next time instead of retyping it.
--
-- Deliberately its own small table rather than folding into any existing
-- one (athletes/profiles are the club's own people; sponsorships already
-- has its own contact fields for a different purpose entirely) -- this is
-- specifically outside contacts: other teams/orgs the club invites.
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  first_name text not null check (length(first_name) <= 100),
  last_name text not null check (length(last_name) <= 100),
  email text not null check (length(email) <= 200),
  organization text check (organization is null or length(organization) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Dedupe primarily by email, case-insensitive, per the request.
create unique index contacts_email_lower_idx on public.contacts (lower(email));
create index contacts_search_idx on public.contacts using gin (
  to_tsvector('simple', coalesce(first_name, '') || ' ' || coalesce(last_name, '') || ' ' || coalesce(organization, '') || ' ' || email)
);

alter table public.contacts enable row level security;

create policy "Owners and coaches manage contacts"
  on public.contacts for all
  to authenticated
  using (public.current_user_role() in ('owner', 'coach'))
  with check (public.current_user_role() in ('owner', 'coach'));

-- Links an invited team/org back to a reusable contact once one exists.
-- The existing team_name/contact_name/contact_email/contact_phone columns
-- stay as-is (a snapshot of who was invited at the time, same as before);
-- contact_id is purely where that info can be reused from/saved back to.
alter table public.hosted_event_invites add column contact_id uuid references public.contacts(id);

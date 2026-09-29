-- Coach registration: replaces the "SD ECA - New Coaches Information"
-- Google Form. Same questions (contact, DOB, shirt size, emergency contact,
-- lifeguard cert, USA Water Polo coach membership, W-9, Zelle, availability)
-- plus the Venmo / mailing address the older form asked for.
--
-- Deliberately NOT here: the hourly rate. That's entered by the owner on
-- the backend (coach_pay_rates, via the Coaches / Coach Registrations
-- admin pages) and is never shown on or accepted from the public form.
--
-- Like the sponsor form, this is public -- a brand-new coach fills it out
-- before they have an account. Anyone may INSERT; only an owner may read,
-- edit or delete. The browser never gets to read rows back, so a submitted
-- DOB / emergency contact / W-9 is visible to nobody but the owner.
create table public.coach_registrations (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (length(full_name) between 1 and 200),
  email text not null check (length(email) between 3 and 320),
  phone text not null check (length(phone) <= 40),
  date_of_birth date not null,
  shirt_size text not null check (shirt_size in ('XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL')),
  mailing_address text check (mailing_address is null or length(mailing_address) <= 500),
  emergency_contact_name text not null check (length(emergency_contact_name) <= 200),
  emergency_contact_relationship text not null check (length(emergency_contact_relationship) <= 100),
  emergency_contact_phone text not null check (length(emergency_contact_phone) <= 40),
  lifeguard_certified boolean not null,
  lifeguard_expiration date,
  uswp_member boolean not null,
  uswp_member_number text check (uswp_member_number is null or length(uswp_member_number) <= 50),
  uswp_expiration date,
  zelle_status text not null check (zelle_status in ('yes', 'can_set_up', 'no')),
  zelle_contact text check (zelle_contact is null or length(zelle_contact) <= 200),
  venmo_username text check (venmo_username is null or length(venmo_username) <= 100),
  availability text check (availability is null or length(availability) <= 4000),
  -- Path inside the private coach-documents bucket; the owner page turns it
  -- into a short-lived signed download link.
  w9_path text check (w9_path is null or w9_path like 'w9/%'),
  owner_notes text check (owner_notes is null or length(owner_notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index coach_registrations_email_idx on public.coach_registrations (lower(email));
create index coach_registrations_created_idx on public.coach_registrations (created_at desc);

alter table public.coach_registrations enable row level security;

create policy "Anyone can submit a coach registration"
  on public.coach_registrations for insert
  to anon, authenticated
  with check (owner_notes is null);

create policy "Owners manage coach registrations"
  on public.coach_registrations for all
  to authenticated
  using (public.current_user_role() = 'owner')
  with check (public.current_user_role() = 'owner');

create trigger coach_registrations_set_updated_at
  before update on public.coach_registrations
  for each row execute function public.set_updated_at();

-- Private bucket for W-9s (they carry SSNs). Anyone may upload a NEW file
-- under w9/ (no update policy, so an upload can never overwrite someone
-- else's); only the owner can read or delete. 10MB, PDF or photo.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('coach-documents', 'coach-documents', false, 10485760,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp'])
on conflict (id) do nothing;

create policy "Anyone can upload a coach W-9"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'coach-documents' and (storage.foldername(name))[1] = 'w9');

create policy "Owners read coach documents"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'coach-documents' and public.current_user_role() = 'owner');

create policy "Owners delete coach documents"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'coach-documents' and public.current_user_role() = 'owner');

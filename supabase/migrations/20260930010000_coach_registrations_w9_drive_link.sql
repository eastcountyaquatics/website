-- Coaches imported from the "SD ECA - New Coaches Information (2026)"
-- Google Form uploaded their W-9 to Google Drive rather than to the
-- coach-documents bucket; keep that link so the owner page can open it.
-- Only Google Drive links, and only the owner can set it -- the public
-- form's insert policy rejects it.
--
-- (Applied directly in the SQL editor: the migration tool timed out.
-- The 12 form responses themselves were imported as data, not here.)
alter table public.coach_registrations add column w9_external_url text
  check (w9_external_url is null or w9_external_url like 'https://drive.google.com/%');

alter policy "Anyone can submit a coach registration" on public.coach_registrations
  with check (owner_notes is null and w9_external_url is null);

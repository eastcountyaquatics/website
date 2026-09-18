-- Bug found before shipping: admin-hosted-events.html upserts contacts
-- with onConflict:"email", which requires a real unique constraint on the
-- literal `email` column -- the functional unique index on lower(email)
-- from the previous migration doesn't satisfy that, so the upsert would
-- have failed with "no unique or exclusion constraint matching the ON
-- CONFLICT specification" on every single invite.
--
-- Fix: store email normalized to lowercase (the app now lowercases it
-- before every write) and enforce uniqueness on the plain column, which
-- upsert can actually target.
update public.contacts set email = lower(email);
drop index public.contacts_email_lower_idx;
alter table public.contacts add constraint contacts_email_key unique (email);

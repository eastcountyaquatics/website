-- Public contact email for a coach, shown on the team page(s) they head.
-- Separate from invite_email (which is only for linking a login) so the
-- club decides exactly which address parents see.
alter table public.coaches
  add column if not exists contact_email text
  check (contact_email is null or contact_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$');

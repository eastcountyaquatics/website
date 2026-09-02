-- Richer athlete + parent info for the coach-facing Roster page: emergency
-- contact, shirt size, and a phone number for the parent account.

alter table public.profiles add column phone text;

alter table public.athletes
  add column emergency_contact_name text,
  add column emergency_contact_phone text,
  add column shirt_size text;

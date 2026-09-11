-- The previous migration's "revoke select (coach_notes) ... from
-- authenticated, anon" had no effect: Postgres column-level REVOKE cannot
-- subtract from a broader table-level SELECT grant that Supabase already
-- set up (grant select on all tables in schema public ...), so the
-- table-wide grant kept authorizing every column regardless. The only way
-- to actually restrict one column is to revoke the table-wide SELECT and
-- re-grant SELECT on every other column explicitly.
revoke select on public.athletes from authenticated, anon;

grant select (
  id, parent_id, full_name, birthdate, notes, created_at,
  emergency_contact_name, emergency_contact_phone1, school, team_slug,
  uswp_number, sex, emergency_contact_email, emergency_contact_phone2,
  emergency_contact2_name, emergency_contact2_email,
  emergency_contact2_phone1, emergency_contact2_phone2
) on public.athletes to authenticated, anon;

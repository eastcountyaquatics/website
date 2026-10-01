-- Only the club manager (role 'owner') should be able to add/remove coach
-- roster entries or change BAND group links; coaches previously had the
-- same write access as the manager on both. Coaches keep their existing
-- narrow self-claim ability on coaches (see guard_coach_profile_link) and
-- read access on both tables, so UPDATE on coaches is left unchanged.
--
-- Uses ALTER POLICY (rename + redefine) rather than DROP+CREATE: DROP POLICY
-- was observed to hang against this project in this environment, while
-- ALTER POLICY completed instantly (see the coach_hours RLS fix migration
-- for the same workaround).

alter policy "Owners and coaches manage band links" on band_links
  rename to "Owners manage band links";
alter policy "Owners manage band links" on band_links
  using (current_user_role() = 'owner')
  with check (current_user_role() = 'owner');

alter policy "Owners and coaches can insert coaches" on coaches
  rename to "Owners can insert coaches";
alter policy "Owners can insert coaches" on coaches
  with check (current_user_role() = 'owner');

alter policy "Owners and coaches can delete coaches" on coaches
  rename to "Owners can delete coaches";
alter policy "Owners can delete coaches" on coaches
  using (current_user_role() = 'owner');

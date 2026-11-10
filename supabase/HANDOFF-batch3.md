# Handoff: owner requests, batch 3

Apply, in order:
1. `20261113000000_alumni.sql` (`alumni_contacts`; anyone can add themselves, owners manage)
2. `20261113010000_coach_hub.sql` (`coach_resources` + starter vocabulary; staff read, Manager/Head Coach edit)

Check: signed out, `select` on `alumni_contacts` returns nothing and an insert of a plain row works;
signed-in coach can read `coach_resources` but not insert; Manager can.

3. `20261114000000_crm_from_signups.sql` (apply AFTER the alumni migration). Adds a trigger so every new
   account (non-staff) lands in `alumni_contacts` (source `account`), and backfills existing accounts as
   "not OK to email". The trigger swallows its own errors so it can never block a sign-up.
   Check: create a test account; it appears under Admin > Contacts with source "Account". Uses
   `create or replace trigger` (Postgres 14+), no DROP.

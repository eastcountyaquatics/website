# Handoff: owner requests, batch 3

> **Status (Nov 10, 2026): applied; all checks passed.**
> Applied in order: `alumni_contacts`, `coach_resources` (15 starter vocabulary rows), `crm_from_signups`
> (trigger `add_signup_to_contacts` on profiles; backfilled the 1 existing non-staff account as `source` account,
> `wants_email` false). Checked in rolled-back transactions, nothing left behind:
> signed out sees 0 contacts and can add a plain row, but not one with a custom source, `wants_email` false or notes;
> a coach reads `coach_resources` but can't insert or edit, and sees no contacts; an owner can insert and sees contacts.
> New accounts: a normal sign-up lands in contacts (source account, segment parent, OK to email); one that unticks
> club news is added with `wants_email` false; a duplicate email adds no second row and never blocks sign-up.

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

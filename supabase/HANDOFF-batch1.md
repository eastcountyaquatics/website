# Handoff: owner requests, batch 1

> **Status (Nov 10, 2026): applied and deployed; one check still needs a live run.**
> Migrations applied: `sponsorships.comments`, `team_messages.recipients` (text[] default empty).
> Redeployed with JWT on: send-team-message v3, send-team-announcement-email v13, send-tournament-reminder v12
> (all copy the club address, default eastcountyaquatics@gmail.com; `CLUB_CC_EMAIL` secret not set, so the default applies).
> Checked: a `team_messages` row with `recipients` saves and reads back. **Not run live:** the test message to two
> groups (the deploying sandbox can't reach the functions, and both groups have 0 members). To finish: add a test
> athlete to two groups, send from Admin > Team Groups & Messages, confirm the club inbox copy and the CSV.

1. Apply migrations (in order):
   - `20261111000000_sponsorship_comments.sql` (adds `sponsorships.comments`, used by "Other comments" on Donate and Sponsor)
   - `20261111010000_team_messages_recipients.sql` (adds `team_messages.recipients`, used by the sent-emails CSV)
2. Redeploy edge functions: `send-team-message`, `send-team-announcement-email`, `send-tournament-reminder`.
   They now copy every email to the club address (Resend `cc`). Default `eastcountyaquatics@gmail.com`;
   override with the `CLUB_CC_EMAIL` secret. `send-team-message` also accepts `subgroup_ids` (several groups).
3. Check: send a test team message to two groups; confirm the club inbox gets a copy and
   Admin > Team Groups & Messages > "Download sent emails (CSV)" lists the recipients.

# Handoff: owner requests, batch 1

1. Apply migrations (in order):
   - `20261111000000_sponsorship_comments.sql` (adds `sponsorships.comments`, used by "Other comments" on Donate and Sponsor)
   - `20261111010000_team_messages_recipients.sql` (adds `team_messages.recipients`, used by the sent-emails CSV)
2. Redeploy edge functions: `send-team-message`, `send-team-announcement-email`, `send-tournament-reminder`.
   They now copy every email to the club address (Resend `cc`). Default `eastcountyaquatics@gmail.com`;
   override with the `CLUB_CC_EMAIL` secret. `send-team-message` also accepts `subgroup_ids` (several groups).
3. Check: send a test team message to two groups; confirm the club inbox gets a copy and
   Admin > Team Groups & Messages > "Download sent emails (CSV)" lists the recipients.

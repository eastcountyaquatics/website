# Handoff: owner requests, batch 2 (hosted events)

> **Status (Nov 10, 2026): applied and deployed; the live page check still needs a person.**
> Migration applied: `hosted_events.level_caps` (jsonb, default `[]`).
> Redeployed with JWT off, as before: get-hosted-event-invite v13, create-hosted-event-checkout v15.
> Checked by running the deployed code against a stand-in database: with a limit of 1 on an age group the invite
> returns `spots_left` 1 (page shows "1 spot left"), 0 after one team pays ("Full"), and checkout answers
> "14U is full." (HTTP 409); a per-club limit of 2 rejects 3 teams (HTTP 400); uncapped age groups still go through.
> **Not run live:** setting a limit in Admin > Hosted Events and viewing the real signup page.

1. Apply `supabase/migrations/20261112000000_hosted_event_caps.sql` (adds `hosted_events.level_caps`).
2. Redeploy edge functions: `get-hosted-event-invite` (returns spots left per age group) and
   `create-hosted-event-checkout` (rejects sign-ups over the per-club or total limit).
3. Check: in Admin > Hosted Events turn on "Limit how many teams can sign up", set a total of 1 for an
   age group, pay for 1 team, then open another invite: that age group should show "Full".

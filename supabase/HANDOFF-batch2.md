# Handoff: owner requests, batch 2 (hosted events)

1. Apply `supabase/migrations/20261112000000_hosted_event_caps.sql` (adds `hosted_events.level_caps`).
2. Redeploy edge functions: `get-hosted-event-invite` (returns spots left per age group) and
   `create-hosted-event-checkout` (rejects sign-ups over the per-club or total limit).
3. Check: in Admin > Hosted Events turn on "Limit how many teams can sign up", set a total of 1 for an
   age group, pay for 1 team, then open another invite: that age group should show "Full".

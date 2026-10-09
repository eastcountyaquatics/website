-- When a hosted-event invite was last emailed (send-hosted-event-invites),
-- shown on Admin > Hosted Events. Teams invited by email only have no team
-- name until they give one at signup (create-hosted-event-checkout), so
-- team_name may be blank.
alter table public.hosted_event_invites add column if not exists emailed_at timestamptz;

-- Caught by the Supabase performance advisor after this session's work:
-- two foreign keys I added (head_coach_teams.team_slug, from the Head
-- Coach migration; hosted_event_invites.contact_id, from the Team
-- Contact CRM work) had no covering index, which makes every FK check
-- and every join through them a sequential scan as the tables grow.
create index if not exists head_coach_teams_team_slug_idx on public.head_coach_teams (team_slug);
create index if not exists hosted_event_invites_contact_id_idx on public.hosted_event_invites (contact_id);

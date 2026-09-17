-- Tournament interest-form / live-registration lifecycle (status), true
-- multi-day date support, and an optional age cap.
--
-- status defaults to 'live' so every existing tournament keeps behaving
-- exactly as it does today (published/invite/RSVP/pay) -- 'interest' is a
-- new, opt-in stage for a tournament the club is only considering. Nothing
-- new is needed to track "who's interested": tournament_rsvps already is
-- that (a plain yes/maybe/no with no payment attached), and the existing
-- tournament_rsvps_create_invite trigger already turns a 'yes' into a
-- tournament_invites row -- so the moment an interest-stage tournament goes
-- live, those same rows are already exactly the roster to invite/collect
-- from. Going live needs no separate "carry over" step.
--
-- Multi-day support is deliberately just two extra columns rather than a
-- new child table: end_date for a start/end range, additional_dates for a
-- handful of non-contiguous days (e.g. Fri + Sun of a weekend pool split).
-- Either, both, or neither can be set; event_date remains the one required
-- "starts on" date every existing query already filters/sorts by.
alter table public.tournaments
  add column status text not null default 'live' check (status in ('interest', 'live')),
  add column end_date date,
  add column additional_dates date[] not null default '{}',
  add column max_age integer check (max_age is null or max_age > 0),
  add column age_as_of date;

alter table public.hosted_events
  add column end_date date,
  add column additional_dates date[] not null default '{}';

comment on column public.tournaments.age_as_of is
  'Defaults to event_date at creation time in the app; admin can override. Null max_age means no cap.';

-- Hosted events cleanup: hotel/hotel link/max teams are being dropped
-- outright (table is empty in production, so there is nothing to migrate),
-- and "level" becomes a multi-select array so one event can span several
-- age/division tags (plus a free-text "Other").
alter table public.hosted_events
  drop column hotel_name,
  drop column hotel_url,
  drop column max_teams,
  drop column level,
  add column levels text[] not null default '{}',
  add column schedule_url text,
  add column schedule_updated_at timestamptz;

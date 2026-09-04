-- Full replacement for the team-by-team Google Sheets tournament
-- workflow: a tournament can now be scoped to one team, families RSVP
-- yes/no/maybe per athlete from the dashboard, and coaches build the
-- actual roster from those RSVPs. Flipping a family onto the roster
-- auto-creates the same invite-link row the standalone invite-only flow
-- already uses, so payment collection doesn't need a second code path.

alter table public.tournaments
  add column team_slug text,
  add column rsvp_deadline date;

-- A coach could previously click "Generate Invite Link" twice for the
-- same athlete and get two separate tokens; harmless but messy, and the
-- roster-auto-invite trigger below needs something to ON CONFLICT against.
alter table public.tournament_invites
  add constraint tournament_invites_tournament_athlete_key unique (tournament_id, athlete_id);

-- A parent already sees everything in a tournament_invites row (token,
-- status) the moment they open the public invite link for their own
-- athlete -- letting them SELECT it while signed in doesn't expose
-- anything new, and it's what lets the dashboard show payment status /
-- trigger checkout without asking them to dig up the link.
create policy "Parents can view invites for their own athletes"
  on public.tournament_invites for select
  using (exists (
    select 1 from public.athletes a
    where a.id = tournament_invites.athlete_id and a.parent_id = (select auth.uid())
  ));

create table public.tournament_rsvps (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  response text not null check (response in ('yes', 'no', 'maybe')),
  notes text,
  responded_at timestamptz not null default now(),
  -- Set by a coach/owner after reviewing RSVPs, never by the family
  -- themselves -- see the with-check restriction on the parent policy
  -- below. Flipping this to true is what puts the athlete on the actual
  -- roster and (via the trigger below) opens up payment.
  on_roster boolean not null default false
);

alter table public.tournament_rsvps add constraint tournament_rsvps_tournament_athlete_key unique (tournament_id, athlete_id);
create index tournament_rsvps_tournament_id_idx on public.tournament_rsvps(tournament_id);
create index tournament_rsvps_athlete_id_idx on public.tournament_rsvps(athlete_id);

alter table public.tournament_rsvps enable row level security;

create policy "Parents manage RSVPs for their own athletes"
  on public.tournament_rsvps for all
  using (exists (
    select 1 from public.athletes a
    where a.id = tournament_rsvps.athlete_id and a.parent_id = (select auth.uid())
  ))
  with check (
    exists (
      select 1 from public.athletes a
      where a.id = tournament_rsvps.athlete_id and a.parent_id = (select auth.uid())
    )
    and on_roster = false
  );

create policy "Owners and coaches manage all RSVPs"
  on public.tournament_rsvps for all
  using (public.current_user_role() in ('owner', 'coach'))
  with check (public.current_user_role() in ('owner', 'coach'));

create or replace function public.tournament_rsvp_create_invite()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.tournament_invites (tournament_id, athlete_id)
  values (new.tournament_id, new.athlete_id)
  on conflict (tournament_id, athlete_id) do nothing;
  return new;
end;
$$;

create trigger tournament_rsvps_create_invite
  after update on public.tournament_rsvps
  for each row
  when (new.on_roster = true and old.on_roster is distinct from true)
  execute function public.tournament_rsvp_create_invite();

-- Generic, type-agnostic account notifications. Nothing like this existed
-- before (team_announcements is the closest analog, but it's a
-- team-wide broadcast with per-athlete responses, not a per-user inbox).
-- `type` + `data` (jsonb) let this same table carry other kinds of
-- notifications later without a schema change; `action_result` is a
-- generic free-text outcome slot (e.g. 'accepted'/'declined' for a
-- tournament invite) rather than inventing a type-specific column.
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (length(type) <= 60),
  title text not null check (length(title) <= 200),
  body text check (body is null or length(body) <= 2000),
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  actioned_at timestamptz,
  action_result text check (action_result is null or length(action_result) <= 40),
  created_at timestamptz not null default now()
);

create index notifications_user_id_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

create policy "Users view their own notifications"
  on public.notifications for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "Users update their own notifications"
  on public.notifications for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Owners and coaches can create notifications"
  on public.notifications for insert
  to authenticated
  with check (public.current_user_role() in ('owner', 'coach'));

create or replace function public.notify_tournament_invite()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_parent_id uuid;
  v_athlete_name text;
  v_tournament_name text;
  v_event_date date;
  v_team_slug text;
  v_team_label text;
begin
  select parent_id, full_name into v_parent_id, v_athlete_name
  from public.athletes where id = new.athlete_id;

  select name, event_date, team_slug into v_tournament_name, v_event_date, v_team_slug
  from public.tournaments where id = new.tournament_id;

  if v_team_slug is not null then
    select team_label into v_team_label from public.schedules where team_slug = v_team_slug;
  end if;

  if v_parent_id is null then
    return new;
  end if;

  insert into public.notifications (user_id, type, title, body, data)
  values (
    v_parent_id,
    'tournament_invite',
    coalesce(v_athlete_name, 'Your athlete') || ' is invited to ' || coalesce(v_tournament_name, 'a tournament'),
    coalesce(v_tournament_name, 'A tournament') ||
      (case when v_event_date is not null then ' on ' || to_char(v_event_date, 'FMMonth FMDD, YYYY') else '' end) ||
      (case when v_team_label is not null then ' with ' || v_team_label else '' end) || '.',
    jsonb_build_object(
      'tournament_id', new.tournament_id,
      'athlete_id', new.athlete_id,
      'invite_id', new.id,
      'tournament_name', v_tournament_name,
      'event_date', v_event_date,
      'team_slug', v_team_slug,
      'team_label', v_team_label,
      'athlete_name', v_athlete_name
    )
  );
  return new;
end;
$$;

drop trigger if exists tournament_invites_notify on public.tournament_invites;
create trigger tournament_invites_notify
  after insert on public.tournament_invites
  for each row execute function public.notify_tournament_invite();

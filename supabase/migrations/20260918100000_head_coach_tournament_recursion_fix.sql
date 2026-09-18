-- Fix: "Head coaches manage invites/RSVPs for their team's tournaments"
-- did a plain subquery on public.tournaments, and tournaments already has
-- "Parents can view tournaments they're invited to" which subqueries
-- tournament_invites -- together that's a real RLS recursion cycle
-- (tournaments -> tournament_invites -> tournaments -> ...), caught by an
-- in-database probe. Fixed the same way is_head_coach_for() already
-- avoids this: a SECURITY DEFINER function whose internal read of
-- tournaments runs as the table owner (bypassing RLS), so it never
-- re-enters tournaments' own policies.
create or replace function public.is_head_coach_for_tournament(target_tournament_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.tournaments t
    where t.id = target_tournament_id
      and t.team_slug is not null
      and public.is_head_coach_for(t.team_slug)
  );
$$;
grant execute on function public.is_head_coach_for_tournament(uuid) to authenticated;

drop policy "Head coaches manage invites for their team's tournaments" on public.tournament_invites;
create policy "Head coaches manage invites for their team's tournaments"
  on public.tournament_invites for all
  to authenticated
  using (public.is_head_coach_for_tournament(tournament_id))
  with check (public.is_head_coach_for_tournament(tournament_id));

drop policy "Head coaches manage RSVPs for their team's tournaments" on public.tournament_rsvps;
create policy "Head coaches manage RSVPs for their team's tournaments"
  on public.tournament_rsvps for all
  to authenticated
  using (public.is_head_coach_for_tournament(tournament_id))
  with check (public.is_head_coach_for_tournament(tournament_id));

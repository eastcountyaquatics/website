-- Pure performance cleanup flagged by Supabase's advisors -- no behavior
-- change, just faster at scale. Two independent fixes:

-- 1) Foreign key columns with no covering index force a sequential scan
-- whenever Postgres checks referential integrity (e.g. on a delete to the
-- referenced row) or when a query joins/filters on the FK column itself.
create index if not exists athletes_parent_id_idx on public.athletes(parent_id);
create index if not exists attendance_athlete_id_idx on public.attendance(athlete_id);
create index if not exists masters_subscriptions_user_id_idx on public.masters_subscriptions(user_id);
create index if not exists purchases_athlete_id_idx on public.purchases(athlete_id);
create index if not exists purchases_registration_option_id_idx on public.purchases(registration_option_id);
create index if not exists registration_options_team_slug_idx on public.registration_options(team_slug);
create index if not exists tournament_invites_athlete_id_idx on public.tournament_invites(athlete_id);
create index if not exists tournament_invites_tournament_id_idx on public.tournament_invites(tournament_id);
create index if not exists tournament_price_tiers_tournament_id_idx on public.tournament_price_tiers(tournament_id);

-- 2) auth.uid() inside an RLS policy is normally re-evaluated once per row
-- scanned; wrapping it as (select auth.uid()) lets Postgres evaluate it
-- once per query instead (it becomes an InitPlan). Same logic, faster on
-- any table with more than a handful of rows. Pure rewrite -- behavior is
-- identical, just recreating each policy with the wrapped form.
drop policy "Users can view own profile" on public.profiles;
create policy "Users can view own profile"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

drop policy "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy "Users can view own purchases" on public.purchases;
create policy "Users can view own purchases"
  on public.purchases for select
  using ((select auth.uid()) = user_id);

drop policy "Parents manage their own athletes" on public.athletes;
create policy "Parents manage their own athletes"
  on public.athletes for all
  using ((select auth.uid()) = parent_id)
  with check ((select auth.uid()) = parent_id);
-- (matches original: no "to authenticated" restriction on this one)

drop policy "Members can view their own masters subscription" on public.masters_subscriptions;
create policy "Members can view their own masters subscription"
  on public.masters_subscriptions for select using ((select auth.uid()) = user_id);

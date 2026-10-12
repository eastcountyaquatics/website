-- BAND group links are for REGISTERED athletes only. A free-trial athlete
-- counts as active (practice, roster) but not registered, so they don't
-- get the team's BAND link until they pay.

-- Registered = a paid registration (Stripe or Zeffy) in the last 6 months,
-- a Zeffy Masters payment in the last 35 days, or a Masters subscription
-- that's been paid for (not one still waiting on its first payment).
-- athlete_is_active() minus the free trial.
create or replace function public.athlete_is_registered(p_athlete_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
      select 1 from public.purchases
      where athlete_id = p_athlete_id and status = 'paid' and registration_option_id is not null
        and created_at > now() - interval '6 months')
    or exists (
      select 1 from public.purchases
      where athlete_id = p_athlete_id and status = 'paid' and program_kind = 'registration'
        and created_at > now() - interval '6 months')
    or exists (
      select 1 from public.purchases
      where athlete_id = p_athlete_id and status = 'paid' and program_kind = 'masters'
        and created_at > now() - interval '35 days')
    or exists (
      select 1 from public.masters_subscriptions
      where athlete_id = p_athlete_id and status in ('active', 'paused', 'past_due'));
$$;

revoke all on function public.athlete_is_registered(uuid) from public, anon;
grant execute on function public.athlete_is_registered(uuid) to authenticated;

create or replace function public.my_band_links()
returns table (athlete_id uuid, team_slug text, label text, url text)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, b.team_slug, b.label, b.url
  from public.athletes a
  join public.band_links b
    on b.team_slug = public.athlete_team_slug(a.team_slug, a.birthdate, a.sex)
  where a.parent_id = auth.uid()
    and b.url is not null
    and public.athlete_is_registered(a.id);
$$;

revoke all on function public.my_band_links() from public, anon;
grant execute on function public.my_band_links() to authenticated;

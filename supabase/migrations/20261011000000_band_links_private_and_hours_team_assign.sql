-- 1) BAND group links are no longer public. Staff can read them (for the
--    BAND Links admin page); a family gets only the links for teams their
--    registered athletes are on, through my_band_links() on My Account.
drop policy if exists "Anyone can view band links" on public.band_links;
create policy "Staff can view band links"
  on public.band_links for select
  using (coalesce(public.current_user_role(), '') in ('owner', 'coach', 'head_coach', 'assistant_coach'));

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
    and public.athlete_is_active(a.id);
$$;

revoke all on function public.my_band_links() from public, anon;
grant execute on function public.my_band_links() to authenticated;

-- 2) A coach who logs hours for a team is put on that team (Team Group on
--    their Coaches card), which is what lists them on the team page and on
--    Coach Pay. Same label format/order as set_coach_on_team.
create or replace function public.add_team_to_coach(p_profile_id uuid, p_team_slug text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  team_lbl text;
  c record;
  parts text[];
  result text;
begin
  if p_team_slug is null or p_team_slug = 'club' then return; end if;
  select team_label into team_lbl from public.schedules where team_slug = p_team_slug;
  if team_lbl is null then return; end if;

  select * into c from public.coaches
    where profile_id = p_profile_id and is_active
    order by sort_order limit 1;
  if not found then return; end if;

  parts := array(
    select trim(x) from unnest(string_to_array(coalesce(c.team_group, ''), '&')) x
    where trim(x) <> ''
  );
  if exists (select 1 from unnest(parts) p where lower(p) = lower(team_lbl)) then
    return;
  end if;
  parts := parts || team_lbl;

  select string_agg(p, ' & ' order by coalesce(s.sort_order, 999), p) into result
  from unnest(parts) p
  left join public.schedules s on lower(s.team_label) = lower(p);

  perform set_config('app.coach_team_assign', 'true', true);
  update public.coaches set team_group = result where id = c.id;
  perform set_config('app.coach_team_assign', 'false', true);
end;
$$;

revoke all on function public.add_team_to_coach(uuid, text) from public, anon, authenticated;

create or replace function public.coach_hours_assign_team()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.add_team_to_coach(new.coach_id, new.team_slug);
  return new;
end;
$$;

revoke all on function public.coach_hours_assign_team() from public, anon, authenticated;

drop trigger if exists coach_hours_auto_assign_team on public.coach_hours;
create trigger coach_hours_auto_assign_team
  after insert on public.coach_hours
  for each row
  execute function public.coach_hours_assign_team();

-- Backfill from hours already logged.
select public.add_team_to_coach(coach_id, team_slug)
from (select distinct coach_id, team_slug from public.coach_hours) h;

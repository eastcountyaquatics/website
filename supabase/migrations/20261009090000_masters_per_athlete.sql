-- Masters membership is now per athlete (an adult athlete on the account),
-- the same as team registration: 25 & Under / 26+ monthly by the player's
-- age, a drop-in, or free for a coach registering themselves.
alter table public.masters_subscriptions
  add column if not exists athlete_id uuid references public.athletes(id) on delete set null;
create index if not exists masters_subscriptions_athlete_id_idx on public.masters_subscriptions (athlete_id);

-- The old account-level free coach memberships (no player attached) are
-- retired -- coaches now join free per athlete record ("this is me").
update public.masters_subscriptions
  set status = 'canceled'
  where comped and athlete_id is null and status <> 'canceled';

-- Adults (19+ as of the Aug 1 cutoff) are the "masters" team for
-- tournaments, team updates and RSVP eligibility.
create or replace function public.athlete_team_slug(p_team_slug text, p_birthdate date, p_sex text)
returns text
language plpgsql
stable
as $$
declare
  season_year int;
  age int;
  bracket text;
begin
  if p_team_slug is not null then return p_team_slug; end if;
  if p_birthdate is null then return null; end if;
  season_year := case when current_date >= make_date(extract(year from current_date)::int, 8, 1)
                      then extract(year from current_date)::int
                      else extract(year from current_date)::int - 1 end;
  age := date_part('year', age(make_date(season_year + 1, 8, 1), p_birthdate))::int;
  if age > 18 then return 'masters'; end if;
  bracket := case when age <= 8 then '8u' when age <= 10 then '10u' when age <= 12 then '12u'
                  when age <= 14 then '14u' when age <= 16 then '16u' else '18u' end;
  if bracket in ('8u', '10u') then return bracket || '-coed'; end if;
  if lower(coalesce(p_sex, '')) = 'male' then return bracket || '-boys'; end if;
  if lower(coalesce(p_sex, '')) = 'female' then return bracket || '-girls'; end if;
  return null;
end;
$$;

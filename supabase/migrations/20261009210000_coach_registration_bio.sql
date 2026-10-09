-- Coaches supply their own bio and headshot on the registration form (no
-- longer on Admin > Coaches > Add a Coach). When a registration comes in,
-- fill them onto the matching coach record wherever it's still blank --
-- matched by linked login, invite/contact email, or exact name.
alter table public.coach_registrations add column if not exists bio text;

create or replace function public.apply_coach_registration_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rec_id uuid;
begin
  if new.photo_url is null and new.bio is null then return new; end if;
  select c.id into rec_id
  from public.coaches c
  left join public.profiles p on p.id = c.profile_id
  where lower(coalesce(p.email, '')) = lower(new.email)
     or lower(coalesce(c.invite_email, '')) = lower(new.email)
     or lower(coalesce(c.contact_email, '')) = lower(new.email)
  order by c.is_active desc
  limit 1;
  if rec_id is null then
    select c.id into rec_id from public.coaches c
    where lower(trim(c.full_name)) = lower(trim(new.full_name))
    order by c.is_active desc
    limit 1;
  end if;
  if rec_id is not null then
    update public.coaches
      set photo_url = coalesce(nullif(photo_url, ''), new.photo_url),
          bio = coalesce(nullif(bio, ''), new.bio)
      where id = rec_id;
  end if;
  return new;
end;
$$;

create or replace trigger coach_registrations_apply_profile
  after insert on public.coach_registrations
  for each row
  execute function public.apply_coach_registration_profile();

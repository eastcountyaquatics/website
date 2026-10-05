-- 1) Phone number collected at sign-up (stored on the profile, same column
--    the dashboard's Account Details already edits).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  pending_role text;
  pending_teams text[];
begin
  select role, team_slugs into pending_role, pending_teams
  from public.pending_role_assignments
  where lower(email) = lower(new.email);

  insert into public.profiles (id, email, full_name, role, phone)
  values (
    new.id, new.email, new.raw_user_meta_data ->> 'full_name', pending_role,
    nullif(left(trim(new.raw_user_meta_data ->> 'phone'), 40), '')
  );

  if pending_role = 'head_coach' and pending_teams is not null then
    insert into public.head_coach_teams (profile_id, team_slug)
    select new.id, unnest(pending_teams)
    on conflict do nothing;
  end if;

  if pending_role is not null then
    delete from public.pending_role_assignments where lower(email) = lower(new.email);
  end if;

  perform set_config('app.linking_via_signup', 'true', true);
  update public.coaches
    set profile_id = new.id
    where profile_id is null
      and invite_email is not null
      and lower(invite_email) = lower(new.email);

  return new;
end;
$function$;

-- 2) Relationship of each emergency contact to the athlete.
alter table public.athletes
  add column if not exists emergency_contact_relationship text,
  add column if not exists emergency_contact2_relationship text;

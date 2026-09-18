-- Lets admin-users.html queue a head_coach role + team assignment for
-- someone who hasn't signed up yet, the same way it already queues
-- plain owner/coach roles.
alter table public.pending_role_assignments add column team_slugs text[] not null default '{}';

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

  insert into public.profiles (id, email, full_name, role)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name', pending_role);

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

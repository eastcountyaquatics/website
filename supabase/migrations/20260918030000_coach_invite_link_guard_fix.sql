-- Bug found while verifying the previous migration: handle_new_user()'s new
-- auto-link update (coaches.profile_id = new.id, matched by invite_email)
-- would have been silently blocked by guard_coach_profile_link() every
-- time. During real signup the request is unauthenticated, so auth.uid()
-- is null and current_user_role() finds no profile -- neither of the
-- guard's allowed cases ("you're the owner" or "you're linking/unlinking
-- your own account") can ever be true in that context.
--
-- Fix: a transaction-local flag the guard trusts, set only by
-- handle_new_user() itself right before its own update -- not reachable
-- from any client request, so this doesn't loosen the guard for anyone
-- else linking or unlinking a coach record.
create or replace function public.guard_coach_profile_link()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if current_setting('app.linking_via_signup', true) = 'true' then
    return new;
  end if;

  if public.current_user_role() = 'owner' then
    return new;
  end if;

  if new.profile_id is not distinct from old.profile_id then
    return new;
  end if;

  if old.profile_id is null and new.profile_id = auth.uid() then
    return new;
  end if;

  if old.profile_id = auth.uid() and new.profile_id is null then
    return new;
  end if;

  raise exception 'You can only link or unlink your own account.';
end;
$function$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  pending_role text;
begin
  select role into pending_role
  from public.pending_role_assignments
  where lower(email) = lower(new.email);

  insert into public.profiles (id, email, full_name, role)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name', pending_role);

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

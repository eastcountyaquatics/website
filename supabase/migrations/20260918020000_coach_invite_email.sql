-- Lets an owner add a coach who doesn't have an account yet, and have that
-- account link back to the bio row automatically the moment they sign up
-- -- instead of the coach having to find and use the "This is me" claim
-- flow on admin-coaches.html themselves.
--
-- invite_email is only ever used to match an unsigned-up coach to their
-- future account; once linked (profile_id set) it's no longer consulted.
alter table public.coaches add column invite_email text;

-- Extends the existing "claim a pending role on signup" trigger to also
-- link any coaches row invited under this email -- guarded by
-- profile_id is null so it can only ever attach to an unclaimed row,
-- never move a bio that's already someone else's (same safety property
-- guard_coach_profile_link already gives the manual claim flow).
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

  update public.coaches
    set profile_id = new.id
    where profile_id is null
      and invite_email is not null
      and lower(invite_email) = lower(new.email);

  return new;
end;
$function$;

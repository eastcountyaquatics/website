-- Every coach (coach, head coach, assistant coach) can edit their OWN
-- profile from the Coaches section -- bio, photo and public contact email.
-- Previously only the 'coach' role could update coaches at all, and it
-- could update anyone's row. The Manager still edits everything.

alter policy "Owners and coaches can update coaches" on public.coaches
  rename to "Owners update coaches; staff update their own profile";

-- profile_id is null covers claiming an unclaimed record ("This is me");
-- guard_coach_profile_link already limits what profile_id may change to.
alter policy "Owners update coaches; staff update their own profile" on public.coaches
  using (
    current_user_role() = 'owner'
    or (current_user_role() in ('coach', 'head_coach', 'assistant_coach')
        and (profile_id = (select auth.uid()) or profile_id is null))
  )
  with check (
    current_user_role() = 'owner'
    or (current_user_role() in ('coach', 'head_coach', 'assistant_coach')
        and (profile_id = (select auth.uid()) or profile_id is null))
  );

-- Non-managers may only change bio/photo/contact email, and only on the
-- record already linked to their own account. Name, title, teams, order,
-- active status and invite email stay manager-only.
create or replace function public.guard_coach_self_edit()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if current_setting('app.linking_via_signup', true) = 'true'
     or public.current_user_role() = 'owner'
     or auth.uid() is null then
    return new;
  end if;

  if new.full_name is distinct from old.full_name
     or new.role_title is distinct from old.role_title
     or new.team_group is distinct from old.team_group
     or new.sort_order is distinct from old.sort_order
     or new.is_active is distinct from old.is_active
     or new.invite_email is distinct from old.invite_email then
    raise exception 'Only the club manager can change a coach''s name, title, teams, order or status.';
  end if;

  if (new.bio is distinct from old.bio
      or new.photo_url is distinct from old.photo_url
      or new.contact_email is distinct from old.contact_email)
     and old.profile_id is distinct from auth.uid() then
    raise exception 'You can only edit your own coach profile.';
  end if;

  return new;
end;
$$;

create trigger coaches_guard_self_edit
  before update on public.coaches
  for each row execute function public.guard_coach_self_edit();

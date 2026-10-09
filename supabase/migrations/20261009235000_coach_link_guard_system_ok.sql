-- Deleting a login (Team Access / Coaches delete) runs as the system, with
-- no signed-in user. The database then clears coaches.profile_id on its
-- own (ON DELETE SET NULL), which this guard was rejecting as "you can
-- only link or unlink your own account" -- so the delete failed. Let
-- system-side changes through; people are still limited as before.
create or replace function public.guard_coach_profile_link()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('app.linking_via_signup', true) = 'true' then
    return new;
  end if;

  -- No signed-in user: the service role or a database cascade.
  if auth.uid() is null then
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
$$;

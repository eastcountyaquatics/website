-- CRITICAL SECURITY FIX: any signed-in user could make themselves an owner.
--
-- The "Users can update own profile" policy is
--   using (auth.uid() = id) with check (auth.uid() = id)
-- with no column restriction, so a parent could call the public REST
-- endpoint (with the publishable key that ships in the site's JS) and run
--   update profiles set role = 'owner' where id = <their own id>
-- Both the USING and WITH CHECK clauses pass -- it's still their own row --
-- so RLS happily allowed it. Verified against production: 1 row updated.
--
-- The blast radius was everything: the admin panel, the full roster of
-- every minor in the club (birthdates, schools, medical notes, emergency
-- contacts), all payment records and exports, Stripe coupon creation, and
-- the ability to re-role other accounts. It also cascaded -- once the role
-- flipped, current_user_role() returned 'owner' for the rest of that
-- transaction, unlocking every other owner-gated write (coaches, schedules,
-- content_blocks, registration_options, pending_role_assignments), all of
-- which are correctly blocked on their own.
--
-- Column-level "revoke update (role)" would also block the owner's
-- legitimate role management in admin-users.html, since column privileges
-- are checked per-role regardless of which policy matched. A trigger lets
-- the owner keep managing roles while blocking everyone else.
create or replace function public.enforce_profile_role_change()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- auth.uid() is null for the service role, edge functions and direct SQL
  -- (trusted contexts). An end-user changing a role must be an owner.
  if new.role is distinct from old.role
     and auth.uid() is not null
     and public.current_user_role() is distinct from 'owner' then
    raise exception 'Only an owner can change a profile role';
  end if;
  return new;
end;
$$;

-- Trigger functions fire regardless of the invoking role's EXECUTE
-- privilege (verified empirically), so keep this off the PostgREST RPC
-- surface like every other internal-only function.
revoke execute on function public.enforce_profile_role_change() from public, anon, authenticated;

create trigger profiles_enforce_role_change
  before update on public.profiles
  for each row execute function public.enforce_profile_role_change();

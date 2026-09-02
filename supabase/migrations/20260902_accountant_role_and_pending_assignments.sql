-- 'accountant' role (sees Sign-Ups + CSV export only). Drops the unused
-- 'staff' role, which granted no access to anything and only cluttered the
-- role picker; no account was using it.
alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('owner', 'coach', 'accountant'));

-- Roles assigned to an email before that person has signed up. Applied
-- automatically by handle_new_user() when they create their account.
create table public.pending_role_assignments (
  email text primary key,
  role text not null check (role in ('owner', 'coach', 'accountant')),
  created_at timestamptz not null default now()
);

alter table public.pending_role_assignments enable row level security;

create policy "Owners manage pending role assignments"
  on public.pending_role_assignments for all
  using (public.current_user_role() = 'owner')
  with check (public.current_user_role() = 'owner');

-- On signup, claim any role pre-assigned to this email.
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

  return new;
end;
$function$;

-- Accountant needs to read every purchase and the buyer's profile for the
-- Sign-Ups view and its QuickBooks CSV export.
create policy "Accountants can view all purchases"
  on public.purchases for select
  using (public.current_user_role() = 'accountant');

create policy "Accountants can view all profiles"
  on public.profiles for select
  using (public.current_user_role() = 'accountant');

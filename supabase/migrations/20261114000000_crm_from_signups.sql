-- Everyone who signs up goes into the Contacts list (Admin > Contacts), so the club can
-- reach families. Staff accounts (coaches, managers) are left out.
--
-- Consent: people who sign up from now on are marked "OK to email" only if they left the
-- "club news" box ticked at sign-up (stored as wants_news in their sign-up details).
-- Accounts that already existed never agreed to club news, so they are added as NOT OK to
-- email; the Manager can change that per person.
--
-- This must never block a sign-up: the trigger swallows its own errors.
create or replace function public.add_signup_to_contacts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  nm text;
  first_n text;
  last_n text;
  ok_email boolean := true;
begin
  begin
    if new.role is not null or new.email is null or length(btrim(new.email)) = 0 then
      return new;
    end if;
    nm := btrim(coalesce(new.full_name, ''));
    first_n := nullif(split_part(nm, ' ', 1), '');
    last_n := nullif(btrim(substr(nm, length(split_part(nm, ' ', 1)) + 1)), '');
    select coalesce((u.raw_user_meta_data ->> 'wants_news')::boolean, true) into ok_email
      from auth.users u where u.id = new.id;
    insert into public.alumni_contacts (first_name, last_name, email, phone, segment, wants_email, source)
    values (left(coalesce(first_n, 'Family'), 100), left(coalesce(last_n, 'Account'), 100), left(new.email, 200),
            nullif(left(coalesce(new.phone, ''), 40), ''), 'parent', coalesce(ok_email, true), 'account')
    on conflict ((lower(email))) do nothing;
  exception when others then
    null;
  end;
  return new;
end;
$$;

revoke all on function public.add_signup_to_contacts() from public;

create or replace trigger add_signup_to_contacts
  after insert on public.profiles
  for each row execute function public.add_signup_to_contacts();

-- One-time: everyone who already has an account (not staff), as NOT OK to email.
-- Adult players who registered themselves (athlete "is me") are Players, or Both if they also
-- registered children.
insert into public.alumni_contacts (first_name, last_name, email, phone, segment, wants_email, source)
select left(coalesce(nullif(split_part(btrim(coalesce(p.full_name, '')), ' ', 1), ''), 'Family'), 100),
       left(coalesce(nullif(btrim(substr(btrim(coalesce(p.full_name, '')), length(split_part(btrim(coalesce(p.full_name, '')), ' ', 1)) + 1)), ''), 'Account'), 100),
       left(p.email, 200),
       nullif(left(coalesce(p.phone, ''), 40), ''),
       case
         when exists (select 1 from public.athletes a where a.parent_id = p.id and a.is_self)
              and exists (select 1 from public.athletes a where a.parent_id = p.id and not a.is_self) then 'both'
         when exists (select 1 from public.athletes a where a.parent_id = p.id and a.is_self) then 'player'
         else 'parent'
       end,
       false,
       'account'
from public.profiles p
where p.role is null and p.email is not null and length(btrim(p.email)) > 0
on conflict ((lower(email))) do nothing;

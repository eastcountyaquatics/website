-- Hours are logged only for coach-level accounts (Coach, Head Coach,
-- Assistant Coach). Managers (owner role -- founders, Finance) aren't
-- coaches here: they no longer appear in any "which coach" picker, and
-- the database refuses new hours logged against them.
create or replace function public.list_staff_profiles()
returns table(id uuid, full_name text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.full_name
  from public.profiles p
  where p.role in ('coach', 'head_coach', 'assistant_coach')
    and public.current_user_role() in ('owner', 'coach', 'head_coach', 'assistant_coach')
  order by p.full_name;
$$;

create or replace function public.enforce_coach_hours_coach_level()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles
    where id = new.coach_id and role in ('coach', 'head_coach', 'assistant_coach')
  ) then
    raise exception 'Hours can only be logged for coaches (Coach, Head Coach or Assistant Coach).';
  end if;
  return new;
end;
$$;

create or replace trigger coach_hours_coach_level
  before insert or update of coach_id on public.coach_hours
  for each row
  execute function public.enforce_coach_hours_coach_level();

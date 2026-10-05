-- Coach registration: lifeguard certificate upload + health issues, and a
-- way for a coach to see their own registration (without the Manager's
-- private notes or the uploaded documents themselves).
alter table public.coach_registrations
  add column if not exists lifeguard_cert_path text,
  add column if not exists health_issues text;

create or replace function public.my_coach_registration()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select (to_jsonb(r) - 'owner_notes' - 'w9_path' - 'w9_external_url' - 'lifeguard_cert_path')
         || jsonb_build_object(
              'has_w9', r.w9_path is not null or r.w9_external_url is not null,
              'has_lifeguard_cert', r.lifeguard_cert_path is not null)
  from public.coach_registrations r
  where auth.uid() is not null
    and lower(r.email) = lower((select email from public.profiles where id = auth.uid()))
  order by r.created_at desc
  limit 1;
$$;
revoke all on function public.my_coach_registration() from public, anon;
grant execute on function public.my_coach_registration() to authenticated;

alter table public.coach_registrations
  add constraint coach_registrations_lifeguard_cert_path_check
    check (lifeguard_cert_path is null or lifeguard_cert_path like 'lifeguard/%'),
  add constraint coach_registrations_health_issues_check
    check (health_issues is null or length(health_issues) <= 2000);

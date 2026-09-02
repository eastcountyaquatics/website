-- Drop the two fields being removed from the athlete form.
alter table public.athletes drop column experience_level;
alter table public.athletes drop column jammer_size;

-- USA Water Polo membership number, and "sex" as distinct from "gender" --
-- competition eligibility rosters (USWP, tournaments) ask for sex
-- specifically; gender stays as-is for the team auto-placement logic.
alter table public.athletes add column uswp_number text;
alter table public.athletes add column sex text check (sex in ('Male', 'Female'));

-- Second emergency contact, and email + a second phone on each.
alter table public.athletes rename column emergency_contact_phone to emergency_contact_phone1;
alter table public.athletes add column emergency_contact_email text;
alter table public.athletes add column emergency_contact_phone2 text;
alter table public.athletes add column emergency_contact2_name text;
alter table public.athletes add column emergency_contact2_email text;
alter table public.athletes add column emergency_contact2_phone1 text;
alter table public.athletes add column emergency_contact2_phone2 text;

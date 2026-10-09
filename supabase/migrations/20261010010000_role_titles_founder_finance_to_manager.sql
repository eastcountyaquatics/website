-- "Club Founder" and "Finance" are no longer Role / Title choices on
-- Admin > Coaches -- they're Managers. (The Club Founders team group, which
-- drives the founders section on About Us, is unchanged.)
update public.coaches
set role_title = 'Manager'
where role_title in ('Club Founder', 'Finance');

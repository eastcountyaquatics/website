-- Item 25: a plain "Donate" option, reusing the sponsorships table and its
-- existing Stripe checkout + RLS rather than a parallel donations table --
-- a donation is a sponsorship row with no tier/website/logo/blurb and a
-- flag distinguishing it for receipt wording and admin display.
alter table public.sponsorships add column is_donation boolean not null default false;
alter table public.sponsorships add column org_name text;

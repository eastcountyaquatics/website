-- Admin > Zeffy: owners pick which Zeffy forms (fundraisers, donation forms,
-- events) appear as cards on the public site (zeffy-public-campaigns).
alter table public.zeffy_campaigns add column if not exists show_on_site boolean not null default false;
alter table public.zeffy_campaigns add column if not exists site_order int not null default 0;

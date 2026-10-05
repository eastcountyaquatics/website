-- Coaches (all staff roles) register themselves for free -- both program
-- registration and Masters. Their kids still pay.
--  * athletes.is_self: "this athlete is me" (the account holder).
--  * masters_subscriptions.comped: a free staff membership with no Stripe
--    subscription behind it.
alter table public.athletes add column if not exists is_self boolean not null default false;
alter table public.masters_subscriptions add column if not exists comped boolean not null default false;

-- athletes SELECT is granted per column (coach_notes stays staff-only via
-- list_athletes_for_staff), so new family-visible columns must be added.
grant select (emergency_contact_relationship, emergency_contact2_relationship, is_self) on public.athletes to authenticated;

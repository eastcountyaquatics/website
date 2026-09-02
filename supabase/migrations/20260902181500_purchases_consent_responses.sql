-- Records what the family agreed to / entered at checkout time (photo
-- consent, guidelines/refund policy acknowledgment, volunteer commitment,
-- how they heard about the club, referral name, discount code entered).
-- Written by the webhook from Stripe session metadata, alongside the
-- purchase row it creates.
alter table public.purchases add column consent_responses jsonb;

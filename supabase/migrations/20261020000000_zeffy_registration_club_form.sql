-- Zeffy sessions can use the club's one pay-what-you-want form instead of a
-- form per session: the site sets each kid's amount, discount codes from
-- Admin > Coupons included (create-zeffy-registration). Remember which
-- discount priced a code so Zeffy uses count toward the code's limit.
alter table public.zeffy_registration_codes add column if not exists discount_code text;
create index if not exists zeffy_registration_codes_discount_idx
  on public.zeffy_registration_codes (discount_code) where discount_code is not null;

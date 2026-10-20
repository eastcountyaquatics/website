-- Family Credits "How" is now just Coupon Issued or Refunded
-- (admin-credits.html). Rename the imported "Coupon code" entries to match;
-- older "Applied to registration" entries keep their wording.
update public.family_credit_uses set method = 'Coupon Issued' where method = 'Coupon code';
update public.family_credit_uses set method = 'Refunded' where method = 'Refund';
alter table public.family_credit_uses alter column method set default 'Coupon Issued';

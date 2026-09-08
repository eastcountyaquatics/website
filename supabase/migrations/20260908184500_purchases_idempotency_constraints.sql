-- Make a double-charged record impossible, not just unlikely.
--
-- Every handler in stripe-webhook guards against Stripe's at-least-once
-- delivery by SELECTing "have we recorded this already?" and then INSERTing.
-- Those two statements are not atomic. Stripe retries can overlap, and two
-- concurrent deliveries of the same event both pass the check and both
-- insert -- duplicate purchase rows, double-counted revenue in Sign-Ups and
-- in the QuickBooks export. Reproduced against this database: the second
-- insert succeeded and left two rows for one payment.
--
-- The constraint has to allow the legitimate case: one checkout session
-- covering several athletes produces several rows sharing a session id and
-- payment intent, differing only by athlete and registration option. So the
-- key is the composite, not the session id alone. NULLS NOT DISTINCT (PG15+)
-- matters because a tournament purchase has a null registration_option_id --
-- without it, two identical tournament rows would not collide.
create unique index if not exists purchases_session_dedupe
  on public.purchases (stripe_checkout_session_id, athlete_id, registration_option_id)
  nulls not distinct
  where stripe_checkout_session_id is not null;

-- Masters renewals arrive as invoice.paid with no checkout session at all;
-- there the payment intent is the natural once-per-charge key.
create unique index if not exists purchases_invoice_dedupe
  on public.purchases (stripe_payment_intent_id)
  where stripe_checkout_session_id is null and stripe_payment_intent_id is not null;

-- registration_options gets the same automatic Stripe pricing as
-- masters_price_tiers: the admin form no longer asks anyone to create a
-- Product + Price in the Stripe dashboard and paste the Price ID by hand.
-- Stripe Prices are immutable, so "changing the price" means creating a
-- new Price under the same Product and archiving the old one -- the
-- Product ID has to be on file for that to work. Nullable because
-- existing rows were created by hand and don't have one yet; the next
-- time one of those is edited, manage-registration-options creates a
-- Product for it and backfills this column.
alter table public.registration_options
  add column stripe_product_id text;

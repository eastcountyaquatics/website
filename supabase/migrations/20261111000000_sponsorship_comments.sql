-- "Other comments" on donations, scholarship gifts and sponsorships: what the
-- giver wants the gift to support, or anything else they want us to know.
-- Optional, shown to owners on Admin > Sponsorships.
alter table public.sponsorships
  add column if not exists comments text
  check (comments is null or length(comments) <= 2000);

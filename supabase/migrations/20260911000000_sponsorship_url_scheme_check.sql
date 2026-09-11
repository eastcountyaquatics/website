-- Security fix: sponsorships.website_url and logo_url were free text with
-- only a length cap. Anyone can submit a sponsorship inquiry anonymously
-- (see "Anyone can submit a sponsorship inquiry" policy), and
-- admin-sponsors.html renders both as clickable <a href> links for the
-- owner reviewing submissions. HTML-escaping the value (which the page
-- already does) protects against markup injection but does nothing about
-- the URL *scheme* -- a submission with website_url set to
-- "javascript:...' would render as a normal-looking link that runs
-- arbitrary JS in the owner's authenticated session the moment they click
-- it. <input type="url"> on the public form doesn't stop this either;
-- the browser's URL validation accepts any scheme, and RLS doesn't check
-- format, so this had to be enforced at the one layer that can't be
-- bypassed by skipping the form and posting to PostgREST directly.
alter table public.sponsorships drop constraint sponsorships_website_url_check;
alter table public.sponsorships add constraint sponsorships_website_url_check
  check (website_url is null or (length(website_url) <= 500 and website_url ~* '^https?://'));

alter table public.sponsorships drop constraint sponsorships_logo_url_check;
alter table public.sponsorships add constraint sponsorships_logo_url_check
  check (logo_url is null or (length(logo_url) <= 500 and logo_url ~* '^https?://'));

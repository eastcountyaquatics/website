-- Defense in depth: a raw <, >, quote, or whitespace character is never
-- legitimate in a URL (it must be percent-encoded per RFC 3986), and
-- allowing one through let a submitted sponsorship website_url/logo_url
-- break out of the href="..." attribute admin-sponsors.html renders it
-- into. The client now escapes these correctly, but reject them at the
-- database layer too so no future render path can reopen this.
alter table public.sponsorships drop constraint sponsorships_website_url_check;
alter table public.sponsorships add constraint sponsorships_website_url_check
  check (website_url is null or (length(website_url) <= 500 and website_url ~* '^https?://' and website_url !~ '[<>"''\s]'));

alter table public.sponsorships drop constraint sponsorships_logo_url_check;
alter table public.sponsorships add constraint sponsorships_logo_url_check
  check (logo_url is null or (length(logo_url) <= 500 and logo_url ~* '^https?://' and logo_url !~ '[<>"''\s]'));

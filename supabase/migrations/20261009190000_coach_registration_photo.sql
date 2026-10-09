-- Coach Registration now requires a headshot, cropped to a square on the
-- form and stored in the public site-images bucket (coaches/registrations/)
-- so it can go straight onto the Coaches page.
alter table public.coach_registrations add column if not exists photo_url text;

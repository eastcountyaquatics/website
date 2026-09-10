-- The "+ Add Section" feature (admin-pages.html) ended up purely
-- client-side: it inserts a heading + paragraph into the existing
-- contenteditable editor, saved through body_html like every other edit,
-- rather than a real block-based storage format. This column from the
-- previous migration was never read or written -- drop it rather than
-- leave unused dead weight implying a feature that doesn't exist.
alter table public.pages drop column if exists blocks;

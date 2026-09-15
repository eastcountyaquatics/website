-- Lets an owner change what tag a content block renders as (e.g. turn a
-- paragraph into a Heading), on top of the text override that already
-- existed. Deliberately restricted at the app layer (not enforced here,
-- since Postgres check constraints on a small fixed set are cheap to
-- widen later) to p/h2/h3: h1 is reserved for a page's one true title
-- (promoting an arbitrary snippet to h1 would hurt both SEO and
-- accessibility, which expect exactly one per page), and li/span/div
-- carry structural meaning tied to their parent that retagging would
-- break (a stray <h2> where a <li> used to be, outside any <ul>).
-- Null means "keep the tag the static page HTML already has."
alter table public.content_blocks
  add column if not exists tag text check (tag is null or tag in ('p', 'h2', 'h3'));

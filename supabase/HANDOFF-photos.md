# Handoff: Photo Library

Apply `supabase/migrations/20261110000000_photo_library.sql` (table `photo_library`,
private bucket `photos-review`, public bucket `photos-public`, RLS + storage policies).

After applying, check: as anon, `select * from photo_library` returns only `status='approved'` rows;
`photos-review` objects are not publicly readable; owners can upload to both buckets.

> **Done (Nov 10, 2026):** migration applied. `photo_library` (RLS on, 2 policies), bucket `photos-review`
> (private) and `photos-public` (public), both 5 MB, JPEG/WebP/PNG, plus the 8 storage policies.
> Checked with test rows and files that were rolled back afterwards: signed-out visitors see only
> approved rows, see no files in `photos-review`, and can see `photos-public` files. Owners see every
> row and can upload to both buckets. A signed-in non-owner sees no unapproved rows and can't upload to
> either bucket or add photos. The library starts empty.

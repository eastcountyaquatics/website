# Handoff: Photo Library

Apply `supabase/migrations/20261110000000_photo_library.sql` (table `photo_library`,
private bucket `photos-review`, public bucket `photos-public`, RLS + storage policies).

After applying, check: as anon, `select * from photo_library` returns only `status='approved'` rows;
`photos-review` objects are not publicly readable; owners can upload to both buckets.

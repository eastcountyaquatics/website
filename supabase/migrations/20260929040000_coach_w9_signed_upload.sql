-- Bug fix: an anonymous upload into the private coach-documents bucket
-- fails, because Storage reads the new object back after inserting it and
-- only owners may read that bucket (W-9s carry SSNs, so that must stay).
-- coach-registration.html now gets a one-time signed upload URL from the
-- coach-w9-upload-url edge function instead, which needs no anon policy
-- at all -- so the open "anyone can upload" policy is dropped.
drop policy "Anyone can upload a coach W-9" on storage.objects;

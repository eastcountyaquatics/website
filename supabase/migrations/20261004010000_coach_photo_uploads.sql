-- Coach photos are uploaded (not pasted as URLs) into the public
-- site-images bucket. The Manager can already upload anywhere there; staff
-- may upload only into their own folder, coaches/<their user id>/.
create policy "Staff can upload their own coach photo" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'site-images'
    and public.current_user_role() in ('coach', 'head_coach', 'assistant_coach')
    and (storage.foldername(name))[1] = 'coaches'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

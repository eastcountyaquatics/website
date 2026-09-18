-- Storage for hosted-event schedule uploads (item 18). Public read so
-- invited teams can always see the current schedule from the public
-- signup/invite page with no login, same as every other public asset on
-- the site; write is owner/coach (hosted events are already an
-- owner+coach area, unlike site-images which is owner-only).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-schedules', 'event-schedules', true, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "Anyone can view event schedules"
  on storage.objects for select
  to public
  using (bucket_id = 'event-schedules');

create policy "Staff can upload event schedules"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'event-schedules' and public.current_user_role() in ('owner', 'coach'));

create policy "Staff can replace event schedules"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'event-schedules' and public.current_user_role() in ('owner', 'coach'))
  with check (bucket_id = 'event-schedules' and public.current_user_role() in ('owner', 'coach'));

create policy "Staff can delete event schedules"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'event-schedules' and public.current_user_role() in ('owner', 'coach'));

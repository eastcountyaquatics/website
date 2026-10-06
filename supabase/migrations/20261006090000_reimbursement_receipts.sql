-- Every "other reimbursement" on Coach Pay needs a receipt. The file goes
-- in the private coach-documents bucket under receipts/<coach id>/; the
-- Manager uploads and views them, a coach can view their own.
alter table public.coach_reimbursements add column if not exists receipt_path text;
alter table public.coach_reimbursements
  add constraint coach_reimbursements_receipt_required check (receipt_path is not null and length(receipt_path) > 0);

create policy "Owners upload reimbursement receipts" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'coach-documents'
    and public.current_user_role() = 'owner'
    and (storage.foldername(name))[1] = 'receipts'
  );

create policy "Coaches read their own reimbursement receipts" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'coach-documents'
    and (storage.foldername(name))[1] = 'receipts'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

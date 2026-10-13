-- Coaches add their own "Other Reimbursement" (receipt required) from
-- Coaches' Hours Logged. Only for themselves: coach_id and created_by must
-- be the signed-in coach, and the receipt must go in their own folder.
-- The Manager keeps full control on Coach Pay; coaches already can read
-- their own rows and receipts (earlier migrations).

create policy "Coaches add their own reimbursements" on public.coach_reimbursements
  for insert to authenticated
  with check (
    public.current_user_role() in ('coach', 'head_coach', 'assistant_coach')
    and coach_id = (select auth.uid())
    and created_by = (select auth.uid())
  );

create policy "Coaches upload their own reimbursement receipts" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'coach-documents'
    and public.current_user_role() in ('coach', 'head_coach', 'assistant_coach')
    and (storage.foldername(name))[1] = 'receipts'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

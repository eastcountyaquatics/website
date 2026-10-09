-- Managers can erase a deleted account's saved records for good
-- (Team Access > Deleted Accounts > Remove).
create policy "Managers remove deleted-account records" on public.deleted_accounts
  for delete to authenticated
  using (public.current_user_role() = 'owner');

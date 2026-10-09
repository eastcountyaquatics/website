-- One "Delete" for people: the log also records coaches who never had a
-- login (Coaches page only), saved by the Manager's own browser.
alter table public.deleted_accounts alter column user_id drop not null;
create policy "Managers log deleted coaches" on public.deleted_accounts
  for insert to authenticated
  with check (public.current_user_role() = 'owner' and user_id is null);

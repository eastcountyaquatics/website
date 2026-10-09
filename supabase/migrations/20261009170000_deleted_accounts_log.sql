-- When a Manager deletes a login from Team Access, its records are saved
-- here first, under the person's name and email, so "Delete anyway" never
-- loses coach hours, coach pay or reimbursements. Written only by the
-- delete-user function (service role); Managers can read it.
create table if not exists public.deleted_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  email text,
  full_name text,
  role text,
  deleted_at timestamptz not null default now(),
  deleted_by uuid references public.profiles(id) on delete set null,
  forced boolean not null default false,
  records jsonb not null default '{}'::jsonb
);
create index if not exists deleted_accounts_deleted_at on public.deleted_accounts (deleted_at desc);
alter table public.deleted_accounts enable row level security;
create policy "Managers view deleted accounts" on public.deleted_accounts
  for select to authenticated
  using (public.current_user_role() = 'owner');

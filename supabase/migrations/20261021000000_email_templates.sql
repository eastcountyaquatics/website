-- Owner-edited wording for the emails the site sends (Admin > Emails).
-- One row per email, keyed like "event_paid"; only exists once an owner has
-- changed that email. Edge functions read it with the service role and fall
-- back to their built-in wording, so a missing row never blocks an email.
-- {{name}}-style fill-ins are replaced by each function.
create table if not exists public.email_templates (
  key text primary key check (key ~ '^[a-z0-9_]{2,60}$'),
  subject text not null check (length(subject) between 1 and 200),
  body text not null check (length(body) between 1 and 8000),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

alter table public.email_templates enable row level security;

create policy "Owners read email templates" on public.email_templates
  for select to authenticated
  using (public.current_user_role() = 'owner');

create policy "Owners manage email templates" on public.email_templates
  for all to authenticated
  using (public.current_user_role() = 'owner')
  with check (public.current_user_role() = 'owner');

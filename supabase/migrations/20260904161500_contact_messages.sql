-- Internal contact form: replaces the external Google Form on contact.html.
-- A visitor picks who they want to reach; the message lands in that coach's
-- own inbox in the admin panel, and the coach replies from their own email
-- client via a mailto: button.

-- Links a coach in the public roster to an actual account. Null means the
-- coach has no login yet -- messages addressed to them still arrive and are
-- visible to the owner, so nothing is silently lost.
alter table public.coaches
  add column if not exists profile_id uuid references public.profiles(id) on delete set null;

create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  -- Null = a general question for the club, which the owner handles.
  recipient_coach_id uuid references public.coaches(id) on delete set null,
  -- The club's own copy says "You may post anonymously or share an email for
  -- a reply", so both of these stay optional. The reply button only appears
  -- when an email was given.
  sender_name text check (sender_name is null or length(sender_name) <= 120),
  sender_email text check (sender_email is null or length(sender_email) <= 200),
  topic text check (topic is null or length(topic) <= 80),
  body text not null check (length(body) between 1 and 5000),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  replied_at timestamptz,
  archived boolean not null default false
);

create index if not exists contact_messages_recipient_idx
  on public.contact_messages (recipient_coach_id, archived, created_at desc);
create index if not exists coaches_profile_id_idx on public.coaches (profile_id);

alter table public.contact_messages enable row level security;

-- Anyone may send, including signed-out visitors -- that is the whole point
-- of a public contact form.
create policy "Anyone can send a contact message"
  on public.contact_messages for insert
  to anon, authenticated
  with check (true);

-- Owners see every message; a coach sees only what was addressed to them.
create policy "Owners read all contact messages"
  on public.contact_messages for select
  to authenticated
  using (public.current_user_role() = 'owner');

create policy "Coaches read messages addressed to them"
  on public.contact_messages for select
  to authenticated
  using (exists (
    select 1 from public.coaches c
    where c.id = contact_messages.recipient_coach_id
      and c.profile_id = auth.uid()
  ));

-- Same visibility for marking read/replied/archived.
create policy "Owners update all contact messages"
  on public.contact_messages for update
  to authenticated
  using (public.current_user_role() = 'owner')
  with check (public.current_user_role() = 'owner');

create policy "Coaches update messages addressed to them"
  on public.contact_messages for update
  to authenticated
  using (exists (
    select 1 from public.coaches c
    where c.id = contact_messages.recipient_coach_id
      and c.profile_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.coaches c
    where c.id = contact_messages.recipient_coach_id
      and c.profile_id = auth.uid()
  ));

create policy "Owners delete contact messages"
  on public.contact_messages for delete
  to authenticated
  using (public.current_user_role() = 'owner');

-- A sender must not be able to post a message that already looks handled,
-- and a recipient must not be able to rewrite what someone sent them. The
-- insert policy's with-check can't express either, so enforce it here.
create or replace function public.guard_contact_message()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.read_at := null;
    new.replied_at := null;
    new.archived := false;
    new.created_at := now();
    return new;
  end if;

  if new.recipient_coach_id is distinct from old.recipient_coach_id
     or new.sender_name is distinct from old.sender_name
     or new.sender_email is distinct from old.sender_email
     or new.topic is distinct from old.topic
     or new.body is distinct from old.body
     or new.created_at is distinct from old.created_at then
    raise exception 'A contact message cannot be edited after it is sent';
  end if;
  return new;
end;
$$;

revoke execute on function public.guard_contact_message() from public, anon, authenticated;

create trigger contact_messages_guard_insert
  before insert on public.contact_messages
  for each row execute function public.guard_contact_message();

create trigger contact_messages_guard_update
  before update on public.contact_messages
  for each row execute function public.guard_contact_message();

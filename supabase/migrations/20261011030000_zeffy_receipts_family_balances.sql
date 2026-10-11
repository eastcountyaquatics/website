-- Families see their Zeffy receipts and tournament balances on the site.

-- Zeffy gives every payment a receipt link; kept on the purchase so My
-- Account and the invite page can link to it.
alter table public.purchases add column if not exists receipt_url text;

-- A family can read the pay link (amount due, paid so far, code) for their
-- own athletes' invites -- My Account shows the balance from it.
create policy "Parents view pay links for their own athletes"
  on public.zeffy_pay_links for select
  to authenticated
  using (exists (
    select 1 from public.tournament_invites i
    join public.athletes a on a.id = i.athlete_id
    where i.id = zeffy_pay_links.tournament_invite_id
      and a.parent_id = (select auth.uid())
  ));

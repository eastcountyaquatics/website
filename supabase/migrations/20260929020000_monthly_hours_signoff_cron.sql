-- Fires send-monthly-hours-signoff at 03:00 UTC on the 1st of every month,
-- which is the evening (7-8pm) of the LAST day of the month in San Diego --
-- so coaches get their "please confirm your hours" email at month end.
--
-- The job proves it's the real cron job (not someone on the internet
-- calling the public function URL) with a random secret generated right
-- here and kept in Vault. It never leaves the database: the job reads it
-- from Vault, and the edge function checks it by calling
-- check_hours_signoff_cron_secret() with the service role.
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'hours_signoff_cron_secret') then
    perform vault.create_secret(encode(gen_random_bytes(32), 'hex'), 'hours_signoff_cron_secret',
      'Shared secret between the monthly-hours-signoff cron job and its edge function');
  end if;
end $$;

create or replace function public.check_hours_signoff_cron_secret(candidate text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from vault.decrypted_secrets
    where name = 'hours_signoff_cron_secret' and decrypted_secret = candidate
  );
$$;

revoke execute on function public.check_hours_signoff_cron_secret(text) from public, anon, authenticated;
grant execute on function public.check_hours_signoff_cron_secret(text) to service_role;

select cron.schedule(
  'monthly-hours-signoff',
  '0 3 1 * *',
  $$
  select net.http_post(
    url := 'https://kdlkkucvdqmcaujhvrwq.supabase.co/functions/v1/send-monthly-hours-signoff',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'hours_signoff_cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);

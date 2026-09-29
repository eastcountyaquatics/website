-- Fires send-monthly-hours-signoff at 03:00 UTC on the 1st of every month,
-- which is the evening (7-8pm) of the LAST day of the month in San Diego --
-- so coaches get their "please confirm your hours" email at month end.
--
-- The URL and shared secret come from Vault rather than being hard-coded
-- here. One-time setup (SQL editor), using the same value as the function's
-- HOURS_SIGNOFF_CRON_SECRET secret:
--   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
--   select vault.create_secret('<random string>', 'hours_signoff_cron_secret');
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'monthly-hours-signoff',
  '0 3 1 * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
           || '/functions/v1/send-monthly-hours-signoff',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'hours_signoff_cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);

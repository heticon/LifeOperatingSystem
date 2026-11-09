-- Life OS — refresh Google Calendar every 15 minutes.
-- Run once in Supabase → SQL Editor after deploying the google-sync Edge Function.
-- The key below is the PUBLIC publishable key (same as in sync.js), not a secret.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('google-sync') where exists (select 1 from cron.job where jobname = 'google-sync');
select cron.schedule('google-sync', '*/15 * * * *', $$
  select net.http_post(
    url     := 'https://ulezusdpxglednvswkyk.supabase.co/functions/v1/google-sync',
    headers := '{"Content-Type": "application/json", "apikey": "sb_publishable_RCK_PYOpusB7LcupzeDf_g_BOzeB8ev"}'::jsonb,
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
$$);

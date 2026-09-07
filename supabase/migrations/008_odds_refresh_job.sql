-- Wiring for the scheduled odds refresh.
--
-- The fetch runs as an Edge Function so that The Odds API key lives in Supabase's
-- secret store and never touches this repository, which is public. The database
-- calls that function on a schedule.
--
-- The function has JWT verification turned off, because pg_cron has no user to
-- authenticate as. A shared secret takes its place: generated here, read by the
-- cron job at fire time, and checked by the function against this same row. It is
-- never written down anywhere a person could copy it from.

create table public.survivor_cron_config (
  id boolean primary key default true,
  refresh_secret text not null,
  function_url text not null,
  constraint survivor_cron_config_single_row check (id)
);

insert into public.survivor_cron_config (refresh_secret, function_url)
values (
  encode(extensions.gen_random_bytes(32), 'hex'),
  'https://cnchsowyukaioujfrups.supabase.co/functions/v1/refresh-odds'
);

-- Nobody reaches this through the API. Only the service role (the Edge Function)
-- and the cron job's superuser context can read it.
alter table public.survivor_cron_config enable row level security;
revoke all on public.survivor_cron_config from anon, authenticated;

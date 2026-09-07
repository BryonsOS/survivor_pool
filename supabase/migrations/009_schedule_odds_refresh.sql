-- Applying a fetched set of odds, and the schedule that fetches them.

-- One statement instead of sixteen round trips, and all-or-nothing: a half-updated
-- board would show some games priced and some not for no visible reason.
--
-- The (away, home) pair is unique across all 272 games of the season, so it is a
-- safe key for odds that arrive without a week number.
create or replace function public.survivor_apply_odds(p_odds jsonb)
returns int
language plpgsql
set search_path = public
as $fn$
declare
  touched int;
begin
  with incoming as (
    select
      o ->> 'away' as away,
      o ->> 'home' as home,
      (o ->> 'away_ml')::int as away_ml,
      (o ->> 'home_ml')::int as home_ml
    from jsonb_array_elements(coalesce(p_odds, '[]'::jsonb)) as o
  )
  update public.survivor_games g
     set home_moneyline = i.home_ml,
         away_moneyline = i.away_ml,
         odds_updated_at = now()
    from incoming i
   where g.away = i.away and g.home = i.home;

  get diagnostics touched = row_count;
  return touched;
end;
$fn$;

-- Only the Edge Function calls this. No player or admin has any reason to.
revoke execute on function public.survivor_apply_odds(jsonb) from public, anon, authenticated;
grant execute on function public.survivor_apply_odds(jsonb) to service_role;

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- Every three hours: often enough that a line move shows up the same afternoon,
-- and 240 calls a month against a 500-call allowance.
select cron.schedule(
  'survivor-refresh-odds',
  '0 */3 * * *',
  $job$
    select net.http_post(
      url := (select function_url from public.survivor_cron_config),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-pool-secret', (select refresh_secret from public.survivor_cron_config)
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 20000
    );
  $job$
);

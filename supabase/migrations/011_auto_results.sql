-- Results fill themselves in from the scoreboard.
--
-- Entering sixteen results by hand every Monday was the last chore that could
-- stall the pool while everyone waited on one person. The same API that prices
-- the games also reports finished ones, so a second scheduled job records them.
--
-- Two rules keep the job from ever undoing a human:
--   * a week already marked final is never touched — that is the sign-off,
--   * an existing result is never overwritten, so a correction sticks.
-- Marking a week final stays manual and stays the thing that costs a strike.

-- Both feeds now log here, so one panel answers "is anything broken".
alter table public.survivor_odds_runs rename to survivor_feed_runs;
alter table public.survivor_feed_runs
  add column kind text not null default 'odds' check (kind in ('odds', 'scores')),
  -- The API reports the month's remaining allowance on every response. Keeping it
  -- turns "are we near the limit" from a guess into a number.
  add column credits_remaining int;

alter policy "admin reads odds runs" on public.survivor_feed_runs
  to authenticated using (public.is_admin());

-- One base URL rather than one per function.
alter table public.survivor_cron_config rename column function_url to functions_base_url;
update public.survivor_cron_config
   set functions_base_url = 'https://cnchsowyukaioujfrups.supabase.co/functions/v1';

create or replace function public.survivor_apply_scores(p_scores jsonb)
returns int
language plpgsql
set search_path = public
as $fn$
declare
  touched int;
begin
  with incoming as (
    select
      s ->> 'away' as away,
      s ->> 'home' as home,
      (s ->> 'away_score')::int as away_score,
      (s ->> 'home_score')::int as home_score
    from jsonb_array_elements(coalesce(p_scores, '[]'::jsonb)) as s
  ),
  matched as (
    select g.week, g.home, g.away, i.home_score, i.away_score
    from incoming i
    join public.survivor_games g on g.away = i.away and g.home = i.home
    join public.survivor_weeks w on w.week = g.week
    -- a signed-off week is history; leave it alone
    where w.status <> 'final'
  ),
  outcomes as (
    select week, home as team,
           case when home_score > away_score then 'win'
                when home_score < away_score then 'loss'
                else 'tie' end as outcome
      from matched
    union all
    select week, away as team,
           case when away_score > home_score then 'win'
                when away_score < home_score then 'loss'
                else 'tie' end as outcome
      from matched
  ),
  written as (
    insert into public.survivor_results (week, team, outcome)
    select week, team, outcome from outcomes
    -- never overwrite a result somebody entered or corrected by hand
    on conflict (week, team) do nothing
    returning 1
  )
  select count(*) into touched from written;

  return touched;
end;
$fn$;

revoke execute on function public.survivor_apply_scores(jsonb) from public, anon, authenticated;
grant execute on function public.survivor_apply_scores(jsonb) to service_role;

-- Is there anything worth asking the scoreboard about? Outside the season this is
-- false every time, so the job costs nothing for eight months of the year.
create or replace function public.survivor_recent_games_exist()
returns boolean
language sql stable
set search_path = public
as $fn$
  select exists (
    select 1 from public.survivor_games g
    join public.survivor_weeks w on w.week = g.week
    where w.status <> 'final'
      and g.kickoff_at between now() - interval '3 days' and now()
  );
$fn$;

grant execute on function public.survivor_recent_games_exist() to service_role;

-- Reschedule both feeds against a 500-credit month.
--
--   odds   1 credit  x 4/day  = 120/month
--   scores 2 credits x 4/day  = 240/month  (and it skips the call entirely when
--                                           nothing has kicked off in 3 days)
--   ------------------------------------
--                       ~360 of 500, leaving room to run either by hand.
--
-- Lines do not move fast enough between Tuesday and Sunday to justify the odds
-- job running twice as often as this.
select cron.unschedule('survivor-refresh-odds');

select cron.schedule(
  'survivor-refresh-odds',
  '0 */6 * * *',
  $job$
    select net.http_post(
      url := (select functions_base_url || '/refresh-odds' from public.survivor_cron_config),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-pool-secret', (select refresh_secret from public.survivor_cron_config)
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 20000
    );
  $job$
);

-- Offset by half an hour so the two jobs never contend for the same moment.
select cron.schedule(
  'survivor-refresh-scores',
  '30 */6 * * *',
  $job$
    select net.http_post(
      url := (select functions_base_url || '/refresh-scores' from public.survivor_cron_config),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-pool-secret', (select refresh_secret from public.survivor_cron_config)
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 20000
    );
  $job$
);

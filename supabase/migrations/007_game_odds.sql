-- Betting odds per game, refreshed automatically from The Odds API.
--
-- Raw American moneylines are stored rather than a win percentage: the vig
-- removal is one line of arithmetic that belongs with the UI, where it is unit
-- tested and can be changed without redeploying the fetch job.

alter table public.survivor_games
  add column home_moneyline int,
  add column away_moneyline int,
  add column odds_updated_at timestamptz;

-- Bookkeeping for the scheduled fetch, so a silent failure is visible.
create table public.survivor_odds_runs (
  id bigserial primary key,
  ran_at timestamptz not null default now(),
  ok boolean not null,
  games_updated int not null default 0,
  detail text
);

alter table public.survivor_odds_runs enable row level security;

create policy "admin reads odds runs" on public.survivor_odds_runs
  for select to authenticated using (public.is_admin());

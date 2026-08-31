-- 2026 NFL schedule: all 272 regular-season games.
--
-- Source: the league's published 2026 schedule PDF. Games the NFL has not flexed yet
-- (4 in Week 16, 4 in Week 17, all 16 of Week 18) have a known matchup but no kickoff;
-- the pool only needs week + matchup to show opponents and block bye teams.
--
-- Verified on import: 272 games, every team plays 17, no team twice in a week, and
-- all 32 teams have exactly one bye.

create table public.survivor_games (
  id uuid primary key default gen_random_uuid(),
  week int not null references public.survivor_weeks(week) on delete cascade,
  away text not null references public.survivor_teams(abbr) on delete restrict,
  home text not null references public.survivor_teams(abbr) on delete restrict,
  neutral_site boolean not null default false,
  kickoff_at timestamptz,
  tv text,
  note text,
  constraint survivor_game_distinct_teams check (away <> home)
);

-- A team plays at most once per week. These indexes enforce that and make the
-- "is this team playing this week" lookup a single index hit.
create unique index survivor_games_week_home on public.survivor_games (week, home);
create unique index survivor_games_week_away on public.survivor_games (week, away);

-- Rows are week|away|home|neutral|kickoff (ET)|tv|note — a blank kickoff means the
-- league has not scheduled that game's time yet.
insert into public.survivor_games (week, away, home, neutral_site, kickoff_at, tv, note)
select
  split_part(r, '|', 1)::int,
  split_part(r, '|', 2),
  split_part(r, '|', 3),
  split_part(r, '|', 4) = 't',
  case when split_part(r, '|', 5) = '' then null
       else split_part(r, '|', 5)::timestamp at time zone 'America/New_York' end,
  nullif(split_part(r, '|', 6), ''),
  nullif(split_part(r, '|', 7), '')
from unnest(string_to_array($schedule$1|NE|SEA|f|2026-09-09 20:20|NBC|
1|SF|LAR|t|2026-09-10 20:35|Netflix|Melbourne
1|CHI|CAR|f|2026-09-13 13:00|FOX|
1|TB|CIN|f|2026-09-13 13:00|FOX|
1|NO|DET|f|2026-09-13 13:00|FOX|
1|BUF|HOU|f|2026-09-13 13:00|CBS|
1|BAL|IND|f|2026-09-13 13:00|CBS|
1|CLE|JAX|f|2026-09-13 13:00|CBS|
1|ATL|PIT|f|2026-09-13 13:00|FOX|
1|NYJ|TEN|f|2026-09-13 13:00|CBS|
1|ARI|LAC|f|2026-09-13 16:25|CBS|
1|MIA|LV|f|2026-09-13 16:25|FOX|
1|GB|MIN|f|2026-09-13 16:25|CBS|
1|WAS|PHI|f|2026-09-13 16:25|FOX|
1|DAL|NYG|f|2026-09-13 20:20|NBC|
1|DEN|KC|f|2026-09-14 20:15|ESPN/ABC|
2|DET|BUF|f|2026-09-17 20:15|AMZ|
2|CAR|ATL|f|2026-09-20 13:00|FOX|
2|NO|BAL|f|2026-09-20 13:00|CBS|
2|MIN|CHI|f|2026-09-20 13:00|FOX|
2|CIN|HOU|f|2026-09-20 13:00|CBS|
2|PIT|NE|f|2026-09-20 13:00|CBS|
2|GB|NYJ|f|2026-09-20 13:00|FOX|
2|CLE|TB|f|2026-09-20 13:00|CBS|
2|PHI|TEN|f|2026-09-20 13:00|FOX|
2|JAX|DEN|f|2026-09-20 16:05|CBS|
2|LV|LAC|f|2026-09-20 16:05|CBS|
2|SEA|ARI|f|2026-09-20 16:25|FOX|
2|WAS|DAL|f|2026-09-20 16:25|FOX|
2|MIA|SF|f|2026-09-20 16:25|FOX|
2|IND|KC|f|2026-09-20 20:20|NBC|
2|NYG|LAR|f|2026-09-21 20:15|ESPN/ABC|
3|ATL|GB|f|2026-09-24 20:15|AMZ|
3|LAC|BUF|f|2026-09-27 13:00|FOX|
3|CAR|CLE|f|2026-09-27 13:00|FOX|
3|NYJ|DET|f|2026-09-27 13:00|FOX|
3|HOU|IND|f|2026-09-27 13:00|CBS|
3|NE|JAX|f|2026-09-27 13:00|CBS|
3|KC|MIA|f|2026-09-27 13:00|CBS|
3|TEN|NYG|f|2026-09-27 13:00|CBS|
3|CIN|PIT|f|2026-09-27 13:00|CBS|
3|SEA|WAS|f|2026-09-27 13:00|FOX|
3|ARI|SF|f|2026-09-27 16:05|FOX|
3|MIN|TB|f|2026-09-27 16:05|FOX|
3|BAL|DAL|t|2026-09-27 16:25|CBS|Rio de Janeiro
3|LV|NO|f|2026-09-27 16:25|CBS|
3|LAR|DEN|f|2026-09-27 20:20|NBC|
3|PHI|CHI|f|2026-09-28 20:15|ESPN/ABC|
4|PIT|CLE|f|2026-10-01 20:15|AMZ|
4|IND|WAS|t|2026-10-04 09:30|NFLN|Tottenham
4|TEN|BAL|f|2026-10-04 13:00|CBS|
4|NE|BUF|f|2026-10-04 13:00|CBS|
4|NYJ|CHI|f|2026-10-04 13:00|FOX|
4|JAX|CIN|f|2026-10-04 13:00|CBS|
4|DAL|HOU|f|2026-10-04 13:00|FOX|
4|ARI|NYG|f|2026-10-04 13:00|CBS|
4|LAR|PHI|f|2026-10-04 13:00|FOX|
4|GB|TB|f|2026-10-04 13:00|FOX|
4|MIA|MIN|f|2026-10-04 16:05|FOX|
4|KC|LV|f|2026-10-04 16:25|CBS|
4|LAC|SEA|f|2026-10-04 16:25|CBS|
4|DEN|SF|f|2026-10-04 16:25|CBS|
4|DET|CAR|f|2026-10-04 20:20|NBC|
4|ATL|NO|f|2026-10-05 20:15|ESPN|
5|TB|DAL|f|2026-10-08 20:15|AMZ|
5|PHI|JAX|t|2026-10-11 09:30|NFLN|Tottenham
5|CIN|MIA|f|2026-10-11 13:00|FOX|
5|LV|NE|f|2026-10-11 13:00|CBS|
5|MIN|NO|f|2026-10-11 13:00|FOX|
5|CLE|NYJ|f|2026-10-11 13:00|CBS|
5|IND|PIT|f|2026-10-11 13:00|CBS|
5|HOU|TEN|f|2026-10-11 13:00|CBS|
5|NYG|WAS|f|2026-10-11 13:00|FOX|
5|DEN|LAC|f|2026-10-11 16:05|CBS|
5|DET|ARI|f|2026-10-11 16:25|FOX|
5|CHI|GB|f|2026-10-11 16:25|FOX|
5|SF|SEA|f|2026-10-11 16:25|FOX|
5|BAL|ATL|f|2026-10-11 20:20|NBC*|
5|BUF|LAR|f|2026-10-12 20:15|ESPN/ABC|
6|SEA|DEN|f|2026-10-15 20:15|AMZ|
6|HOU|JAX|t|2026-10-18 09:30|NFLN|Wembley
6|CHI|ATL|f|2026-10-18 13:00|FOX|
6|BAL|CLE|f|2026-10-18 13:00|FOX|
6|TEN|IND|f|2026-10-18 13:00|FOX|
6|NYJ|NE|f|2026-10-18 13:00|CBS|
6|NO|NYG|f|2026-10-18 13:00|FOX|
6|CAR|PHI|f|2026-10-18 13:00|CBS|
6|PIT|TB|f|2026-10-18 13:00|CBS|
6|ARI|LAR|f|2026-10-18 16:05|FOX|
6|LAC|KC|f|2026-10-18 16:25|CBS|
6|BUF|LV|f|2026-10-18 16:25|CBS|
6|DAL|GB|f|2026-10-18 20:20|NBC*|
6|WAS|SF|f|2026-10-19 20:15|ESPN/ABC|
7|NE|CHI|f|2026-10-22 20:15|AMZ|
7|PIT|NO|t|2026-10-25 09:30|NFLN|Paris
7|SF|ATL|f|2026-10-25 13:00|FOX|
7|CIN|BAL|f|2026-10-25 13:00|CBS|
7|TB|CAR|f|2026-10-25 13:00|FOX|
7|NYG|HOU|f|2026-10-25 13:00|FOX|
7|IND|MIN|f|2026-10-25 13:00|CBS|
7|MIA|NYJ|f|2026-10-25 13:00|CBS|
7|CLE|TEN|f|2026-10-25 13:00|CBS|
7|DEN|ARI|f|2026-10-25 16:05|CBS|
7|GB|DET|f|2026-10-25 16:25|FOX|
7|LAR|LV|f|2026-10-25 16:25|FOX|
7|KC|SEA|f|2026-10-25 20:20|NBC*|
7|DAL|PHI|f|2026-10-26 20:15|ESPN/ABC|
8|CAR|GB|f|2026-10-29 20:15|AMZ|
8|BAL|BUF|f|2026-11-01 13:00|CBS|
8|TEN|CIN|f|2026-11-01 13:00|CBS|
8|ARI|DAL|f|2026-11-01 13:00|FOX|
8|MIN|DET|f|2026-11-01 13:00|FOX|
8|IND|JAX|f|2026-11-01 13:00|CBS|
8|LV|NYJ|f|2026-11-01 13:00|FOX|
8|CLE|PIT|f|2026-11-01 13:00|CBS|
8|ATL|TB|f|2026-11-01 13:00|FOX|
8|LAC|LAR|f|2026-11-01 16:05|FOX|
8|KC|DEN|f|2026-11-01 16:25|CBS|
8|NE|MIA|f|2026-11-01 16:25|CBS|
8|PHI|WAS|f|2026-11-01 20:20|NBC*|
8|CHI|SEA|f|2026-11-02 20:15|ESPN|
9|JAX|BAL|f|2026-11-05 20:15|AMZ|
9|CIN|ATL|t|2026-11-08 09:30|NFLN|Madrid
9|DEN|CAR|f|2026-11-08 13:00|CBS|
9|DAL|IND|f|2026-11-08 13:00|FOX|
9|NYJ|KC|f|2026-11-08 13:00|CBS|
9|DET|MIA|f|2026-11-08 13:00|FOX|
9|CLE|NO|f|2026-11-08 13:00|CBS|
9|NYG|PHI|f|2026-11-08 13:00|FOX|
9|LAR|WAS|f|2026-11-08 13:00|FOX|
9|HOU|LAC|f|2026-11-08 16:05|CBS|
9|LV|SF|f|2026-11-08 16:05|CBS|
9|GB|NE|f|2026-11-08 16:25|FOX|
9|ARI|SEA|f|2026-11-08 16:25|FOX|
9|TB|CHI|f|2026-11-08 20:20|NBC*|
9|BUF|MIN|f|2026-11-09 20:15|ESPN/ABC|
10|WAS|NYG|f|2026-11-12 20:15|AMZ|
10|NE|DET|t|2026-11-15 09:30|FOX|Munich
10|KC|ATL|f|2026-11-15 13:00|CBS|
10|HOU|CLE|f|2026-11-15 13:00|FOX|
10|MIN|GB|f|2026-11-15 13:00|FOX|
10|MIA|IND|f|2026-11-15 13:00|CBS|
10|CAR|NO|f|2026-11-15 13:00|FOX|
10|BUF|NYJ|f|2026-11-15 13:00|CBS|
10|JAX|TEN|f|2026-11-15 13:00|FOX|
10|LAR|ARI|f|2026-11-15 16:05|CBS|
10|SEA|LV|f|2026-11-15 16:05|CBS|
10|SF|DAL|f|2026-11-15 16:25|FOX|
10|PIT|CIN|f|2026-11-15 20:20|NBC*|
10|LAC|BAL|f|2026-11-16 20:15|ESPN|
11|IND|HOU|f|2026-11-19 20:15|AMZ|
11|MIA|BUF|f|2026-11-22 13:00|FOX|
11|BAL|CAR|f|2026-11-22 13:00|FOX|
11|NO|CHI|f|2026-11-22 13:00|FOX|
11|TEN|DAL|f|2026-11-22 13:00|FOX|
11|TB|DET|f|2026-11-22 13:00|CBS|
11|ARI|KC|f|2026-11-22 13:00|CBS|
11|JAX|NYG|f|2026-11-22 13:00|CBS|
11|NYJ|LAC|f|2026-11-22 16:05|FOX|
11|LV|DEN|f|2026-11-22 16:25|CBS|
11|PIT|PHI|f|2026-11-22 16:25|CBS|
11|MIN|SF|t|2026-11-22 20:20|NBC|Mexico City
11|CIN|WAS|f|2026-11-23 20:15|ESPN|
12|GB|LAR|f|2026-11-25 20:00|Netflix|
12|CHI|DET|f|2026-11-26 13:00|CBS|
12|PHI|DAL|f|2026-11-26 16:30|FOX|
12|KC|BUF|f|2026-11-26 20:20|NBC|Thanksgiving
12|DEN|PIT|f|2026-11-27 15:00|AMZ|
12|NO|CIN|f|2026-11-29 13:00|CBS|
12|LV|CLE|f|2026-11-29 13:00|FOX|
12|BAL|HOU|f|2026-11-29 13:00|CBS|
12|NYG|IND|f|2026-11-29 13:00|FOX|
12|NYJ|MIA|f|2026-11-29 13:00|CBS|
12|ATL|MIN|f|2026-11-29 13:00|FOX|
12|TEN|JAX|f|2026-11-29 16:05|CBS|
12|WAS|ARI|f|2026-11-29 16:25|FOX|
12|SEA|SF|f|2026-11-29 16:25|FOX|
12|NE|LAC|f|2026-11-29 20:20|NBC*|
12|CAR|TB|f|2026-11-30 20:15|ESPN*|
13|KC|LAR|f|2026-12-03 20:15|AMZ*|
13|DET|ATL|f|2026-12-06 13:00|CBS|
13|JAX|CHI|f|2026-12-06 13:00|FOX|
13|CIN|CLE|f|2026-12-06 13:00|CBS|
13|GB|NO|f|2026-12-06 13:00|FOX|
13|SF|NYG|f|2026-12-06 13:00|FOX|
13|LAC|TB|f|2026-12-06 13:00|CBS|
13|WAS|TEN|f|2026-12-06 13:00|CBS|
13|PHI|ARI|f|2026-12-06 16:05|FOX|
13|MIA|DEN|f|2026-12-06 16:05|FOX|
13|CAR|MIN|f|2026-12-06 16:25|CBS|
13|BUF|NE|f|2026-12-06 16:25|CBS|
13|HOU|PIT|f|2026-12-06 20:20|NBC*|
13|DAL|SEA|f|2026-12-07 20:15|ESPN/ABC*|
14|MIN|NE|f|2026-12-10 20:15|AMZ*|
14|TB|BAL|f|2026-12-13 13:00|FOX|
14|NO|CAR|f|2026-12-13 13:00|CBS|
14|ATL|CLE|f|2026-12-13 13:00|CBS|
14|TEN|DET|f|2026-12-13 13:00|FOX|
14|CHI|MIA|f|2026-12-13 13:00|CBS|
14|DEN|NYJ|f|2026-12-13 13:00|CBS|
14|IND|PHI|f|2026-12-13 13:00|FOX|
14|HOU|WAS|f|2026-12-13 13:00|CBS|
14|LAC|LV|f|2026-12-13 16:05|CBS|
14|KC|CIN|f|2026-12-13 16:25|FOX|
14|NYG|SEA|f|2026-12-13 16:25|FOX|
14|LAR|SF|f|2026-12-13 16:25|FOX|
14|BUF|GB|f|2026-12-13 20:20|NBC*|
14|PIT|JAX|f|2026-12-14 20:15|ESPN*|
15|SF|LAC|f|2026-12-17 20:15|AMZ*|
15|SEA|PHI|f|2026-12-19 17:00|FOX|
15|CHI|BUF|f|2026-12-19 20:20|CBS|
15|CIN|CAR|f|2026-12-20 13:00|FOX|
15|MIA|GB|f|2026-12-20 13:00|FOX|
15|JAX|HOU|f|2026-12-20 13:00|CBS|
15|CLE|NYG|f|2026-12-20 13:00|CBS|
15|BAL|PIT|f|2026-12-20 13:00|CBS|
15|NO|TB|f|2026-12-20 13:00|FOX|
15|IND|TEN|f|2026-12-20 13:00|CBS|
15|ATL|WAS|f|2026-12-20 13:00|FOX|
15|NYJ|ARI|f|2026-12-20 16:05|FOX|
15|DAL|LAR|f|2026-12-20 16:25|CBS|
15|DEN|LV|f|2026-12-20 16:25|CBS|
15|DET|MIN|f|2026-12-20 20:20|NBC*|
15|NE|KC|f|2026-12-21 20:15|ESPN/ABC*|
16|HOU|PHI|f|2026-12-24 20:15|AMZ*|
16|GB|CHI|f|2026-12-25 13:00|NETFLIX|
16|BUF|DEN|f|2026-12-25 16:30|NETFLIX|
16|LAR|SEA|f|2026-12-25 20:15|FOX|
16|CLE|BAL|f|2026-12-27 13:00|CBS|
16|LAC|MIA|f|2026-12-27 13:00|FOX|
16|ARI|NO|f|2026-12-27 13:00|FOX|
16|NE|NYJ|f|2026-12-27 13:00|CBS|
16|TEN|LV|f|2026-12-27 16:05|FOX|
16|SF|KC|f|2026-12-27 16:25|CBS|
16|JAX|DAL|f|2026-12-27 20:20|NBC*|
16|NYG|DET|f|2026-12-28 20:15|ESPN*|
16|TB|ATL|f|||
16|CIN|IND|f|||
16|WAS|MIN|f|||
16|CAR|PIT|f|||
17|BAL|CIN|f|2026-12-31 20:15|AMZ*|
17|NO|ATL|f|2027-01-03 13:00|FOX|
17|SEA|CAR|f|2027-01-03 13:00|FOX|
17|IND|CLE|f|2027-01-03 13:00|FOX|
17|NYG|DAL|f|2027-01-03 13:00|FOX|
17|BUF|MIA|f|2027-01-03 13:00|CBS|
17|MIN|NYJ|f|2027-01-03 13:00|CBS|
17|PIT|TEN|f|2027-01-03 13:00|CBS|
17|LV|ARI|f|2027-01-03 16:05|CBS|
17|DET|CHI|f|2027-01-03 16:25|FOX|
17|PHI|SF|f|2027-01-03 20:20|NBC*|
17|HOU|GB|f|2027-01-04 20:15|ESPN*|
17|WAS|JAX|f|||
17|KC|LAC|f|||
17|DEN|NE|f|||
17|LAR|TB|f|||
18|SF|ARI|f|||
18|PIT|BAL|f|||
18|NYJ|BUF|f|||
18|ATL|CAR|f|||
18|CLE|CIN|f|||
18|LAC|DEN|f|||
18|DET|GB|f|||
18|TEN|HOU|f|||
18|JAX|IND|f|||
18|LV|KC|f|||
18|SEA|LAR|f|||
18|CHI|MIN|f|||
18|MIA|NE|f|||
18|TB|NO|f|||
18|PHI|NYG|f|||
18|DAL|WAS|f|||$schedule$, E'\n')) as r;

-- Each week now locks at its own first kickoff instead of a blanket Sunday time, so
-- nobody can pick after seeing a result. Week 18 has no scheduled kickoffs yet, so it
-- uses the earliest broadcast slot the league printed for it.
update public.survivor_weeks set locks_at = case week
  when 1 then (timestamp '2026-09-09 20:20' at time zone 'America/New_York')
  when 2 then (timestamp '2026-09-17 20:15' at time zone 'America/New_York')
  when 3 then (timestamp '2026-09-24 20:15' at time zone 'America/New_York')
  when 4 then (timestamp '2026-10-01 20:15' at time zone 'America/New_York')
  when 5 then (timestamp '2026-10-08 20:15' at time zone 'America/New_York')
  when 6 then (timestamp '2026-10-15 20:15' at time zone 'America/New_York')
  when 7 then (timestamp '2026-10-22 20:15' at time zone 'America/New_York')
  when 8 then (timestamp '2026-10-29 20:15' at time zone 'America/New_York')
  when 9 then (timestamp '2026-11-05 20:15' at time zone 'America/New_York')
  when 10 then (timestamp '2026-11-12 20:15' at time zone 'America/New_York')
  when 11 then (timestamp '2026-11-19 20:15' at time zone 'America/New_York')
  when 12 then (timestamp '2026-11-25 20:00' at time zone 'America/New_York')
  when 13 then (timestamp '2026-12-03 20:15' at time zone 'America/New_York')
  when 14 then (timestamp '2026-12-10 20:15' at time zone 'America/New_York')
  when 15 then (timestamp '2026-12-17 20:15' at time zone 'America/New_York')
  when 16 then (timestamp '2026-12-24 20:15' at time zone 'America/New_York')
  when 17 then (timestamp '2026-12-31 20:15' at time zone 'America/New_York')
  when 18 then (timestamp '2027-01-09 13:00' at time zone 'America/New_York')
  end;

update public.survivor_settings
  set pick_deadline_label = 'the first kickoff of each week'
  where id;

-- A team on its bye cannot win, so picking one is a guaranteed strike. Reject it in
-- the database rather than trusting the UI to grey it out.
create or replace function public.survivor_check_pick_playable()
returns trigger
language plpgsql
set search_path = public
as $fn$
begin
  if new.is_bye or new.team is null then
    return new;
  end if;
  if not exists (
    select 1 from public.survivor_games g
    where g.week = new.week and (g.home = new.team or g.away = new.team)
  ) then
    raise exception 'Team % is on a bye in week % and cannot be picked', new.team, new.week
      using errcode = 'check_violation';
  end if;
  return new;
end;
$fn$;

create trigger survivor_picks_playable
  before insert or update on public.survivor_picks
  for each row execute function public.survivor_check_pick_playable();

revoke execute on function public.survivor_check_pick_playable() from anon, authenticated, public;

alter table public.survivor_games enable row level security;

create policy "entrants read games" on public.survivor_games
  for select to authenticated using (public.survivor_is_entrant() or public.is_admin());
create policy "admin writes games" on public.survivor_games
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

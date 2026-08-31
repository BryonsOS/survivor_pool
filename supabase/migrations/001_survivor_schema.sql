-- NFL Survivor Pool schema.
--
-- Shares the fantasy-wrestling Supabase project (cnchsowyukaioujfrups) so league
-- members use one login for both pick'em sites. Everything here is prefixed
-- survivor_ and touches no existing table; identity is reused from public.profiles.
--
-- Single-season by design: survivor_weeks.week is the primary key and the
-- one-time-use rule is a unique index over (user_id, team). Starting a new season
-- means archiving and clearing survivor_picks / survivor_results.

-- ============ TABLES ============

create table public.survivor_settings (
  id boolean primary key default true check (id),
  pool_name text not null default 'SOABOS Survivor Pool',
  season int not null default 2026,
  total_weeks int not null default 18 check (total_weeks between 1 and 25),
  strikes_to_eliminate int not null default 2 check (strikes_to_eliminate between 1 and 5),
  tie_counts_as text not null default 'survive' check (tie_counts_as in ('survive','loss')),
  bye_weeks_per_player int not null default 0 check (bye_weeks_per_player between 0 and 5),
  allow_buy_backs boolean not null default false,
  buy_back_fee numeric(10,2) not null default 0 check (buy_back_fee >= 0),
  missed_pick_policy text not null default 'strike' check (missed_pick_policy in ('strike','record')),
  entry_fee numeric(10,2) not null default 25 check (entry_fee >= 0),
  pick_deadline_label text not null default 'Sunday 1:00 PM ET',
  payout_note text not null default 'Winner takes the pot. If more than one player is still alive after the final week, survivors split evenly.'
);

-- Invite code lives apart from the member-readable rules so members never read it.
create table public.survivor_invite (
  id boolean primary key default true check (id),
  invite_code text not null
);

create table public.survivor_teams (
  abbr text primary key,
  name text not null,
  conference text not null,
  division text not null
);

create table public.survivor_entrants (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  paid boolean not null default false
);

create table public.survivor_weeks (
  week int primary key check (week between 1 and 25),
  locks_at timestamptz,
  status text not null default 'upcoming' check (status in ('upcoming','open','locked','final'))
);

create table public.survivor_results (
  week int not null references public.survivor_weeks(week) on delete cascade,
  team text not null references public.survivor_teams(abbr) on delete cascade,
  outcome text not null check (outcome in ('win','loss','tie')),
  primary key (week, team)
);

create table public.survivor_picks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  week int not null references public.survivor_weeks(week) on delete cascade,
  team text references public.survivor_teams(abbr) on delete restrict,
  is_bye boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week),
  -- a pick is either a team or a BYE, never both and never neither
  constraint survivor_pick_shape check ((is_bye and team is null) or (not is_bye and team is not null))
);

-- THE one-time-use rule, enforced by the database rather than the UI:
-- a member physically cannot hold the same team in two different weeks.
create unique index survivor_picks_one_time_use
  on public.survivor_picks (user_id, team)
  where team is not null;

create index survivor_picks_week_idx on public.survivor_picks (week);
create index survivor_results_week_idx on public.survivor_results (week);

-- ============ SEED ============

insert into public.survivor_settings (id) values (true);
insert into public.survivor_invite (id, invite_code) values (true, 'SURVIVE2026');

insert into public.survivor_teams (abbr, name, conference, division) values
  ('BUF','Buffalo Bills','AFC','East'),
  ('MIA','Miami Dolphins','AFC','East'),
  ('NE','New England Patriots','AFC','East'),
  ('NYJ','New York Jets','AFC','East'),
  ('BAL','Baltimore Ravens','AFC','North'),
  ('CIN','Cincinnati Bengals','AFC','North'),
  ('CLE','Cleveland Browns','AFC','North'),
  ('PIT','Pittsburgh Steelers','AFC','North'),
  ('HOU','Houston Texans','AFC','South'),
  ('IND','Indianapolis Colts','AFC','South'),
  ('JAX','Jacksonville Jaguars','AFC','South'),
  ('TEN','Tennessee Titans','AFC','South'),
  ('DEN','Denver Broncos','AFC','West'),
  ('KC','Kansas City Chiefs','AFC','West'),
  ('LV','Las Vegas Raiders','AFC','West'),
  ('LAC','Los Angeles Chargers','AFC','West'),
  ('DAL','Dallas Cowboys','NFC','East'),
  ('NYG','New York Giants','NFC','East'),
  ('PHI','Philadelphia Eagles','NFC','East'),
  ('WAS','Washington Commanders','NFC','East'),
  ('CHI','Chicago Bears','NFC','North'),
  ('DET','Detroit Lions','NFC','North'),
  ('GB','Green Bay Packers','NFC','North'),
  ('MIN','Minnesota Vikings','NFC','North'),
  ('ATL','Atlanta Falcons','NFC','South'),
  ('CAR','Carolina Panthers','NFC','South'),
  ('NO','New Orleans Saints','NFC','South'),
  ('TB','Tampa Bay Buccaneers','NFC','South'),
  ('ARI','Arizona Cardinals','NFC','West'),
  ('LAR','Los Angeles Rams','NFC','West'),
  ('SF','San Francisco 49ers','NFC','West'),
  ('SEA','Seattle Seahawks','NFC','West');

-- 18 weeks, deadline 1:00 PM America/New_York (the time zone handles DST itself).
insert into public.survivor_weeks (week, locks_at, status)
select
  g.week,
  ((date '2026-09-13' + (g.week - 1) * 7) + time '13:00') at time zone 'America/New_York',
  case when g.week = 1 then 'open' else 'upcoming' end
from generate_series(1, 18) as g(week);

-- ============ HELPERS ============

-- Is the current user enrolled in the survivor pool? (distinct from wrestling membership)
create or replace function public.survivor_is_entrant()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.survivor_entrants where user_id = auth.uid())
$$;

-- Pre-signup invite check, callable before the user has an account.
create or replace function public.survivor_validate_invite(code text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.survivor_invite
    where upper(trim(invite_code)) = upper(trim(code))
  )
$$;

-- Existing members (e.g. from the wrestling league) join the pool with the code.
create or replace function public.survivor_join(code text)
returns boolean
language plpgsql security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return false;
  end if;
  if not public.survivor_validate_invite(code) then
    return false;
  end if;
  insert into public.survivor_entrants (user_id) values (auth.uid())
  on conflict (user_id) do nothing;
  return true;
end;
$$;

grant execute on function public.survivor_validate_invite(text) to anon, authenticated;
grant execute on function public.survivor_join(text) to authenticated;
revoke execute on function public.survivor_validate_invite(text) from public;
revoke execute on function public.survivor_join(text) from anon, public;
revoke execute on function public.survivor_is_entrant() from anon, public;

-- ============ SIGNUP TRIGGER ============

-- Extends the existing trigger: the wrestling invite code behaves exactly as before,
-- and the survivor code becomes a second valid way in (enrolling the new user in the
-- pool). A code matching neither is still rejected.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  s record;
  dn text;
  supplied text;
  survivor_code text;
  joined_survivor boolean := false;
begin
  select * into s from public.league_settings limit 1;
  select invite_code into survivor_code from public.survivor_invite limit 1;
  dn := coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), split_part(new.email, '@', 1));
  supplied := upper(trim(coalesce(new.raw_user_meta_data->>'invite_code', '')));

  if lower(new.email) = lower(s.admin_email) then
    insert into public.profiles (id, display_name, is_admin) values (new.id, dn, true);
    joined_survivor := supplied = upper(trim(coalesce(survivor_code, '')));
  elsif supplied = upper(trim(s.invite_code)) then
    insert into public.profiles (id, display_name, is_admin) values (new.id, dn, false);
  elsif survivor_code is not null and supplied = upper(trim(survivor_code)) then
    insert into public.profiles (id, display_name, is_admin) values (new.id, dn, false);
    joined_survivor := true;
  else
    raise exception 'Invalid invite code';
  end if;

  insert into public.member_details (user_id, real_name)
  values (new.id, nullif(trim(coalesce(new.raw_user_meta_data->>'real_name', '')), ''));

  if joined_survivor then
    insert into public.survivor_entrants (user_id) values (new.id) on conflict (user_id) do nothing;
  end if;

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from anon, authenticated, public;

-- ============ RLS ============

alter table public.survivor_settings enable row level security;
alter table public.survivor_invite   enable row level security;
alter table public.survivor_teams    enable row level security;
alter table public.survivor_entrants enable row level security;
alter table public.survivor_weeks    enable row level security;
alter table public.survivor_results  enable row level security;
alter table public.survivor_picks    enable row level security;

-- settings: any signed-in member reads the rules; only admin changes them
create policy "read survivor settings" on public.survivor_settings
  for select to authenticated using (public.is_member());
create policy "admin writes survivor settings" on public.survivor_settings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- invite code: admin only, never exposed to members
create policy "admin reads survivor invite" on public.survivor_invite
  for select to authenticated using (public.is_admin());
create policy "admin writes survivor invite" on public.survivor_invite
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- teams: static reference data, readable by any signed-in member
create policy "read survivor teams" on public.survivor_teams
  for select to authenticated using (public.is_member());

-- entrants: the roster is visible to entrants (standings need it); admin manages it
create policy "entrants read roster" on public.survivor_entrants
  for select to authenticated using (public.survivor_is_entrant() or public.is_admin());
create policy "admin writes roster" on public.survivor_entrants
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- weeks and results: readable by entrants, written by admin
create policy "entrants read weeks" on public.survivor_weeks
  for select to authenticated using (public.survivor_is_entrant() or public.is_admin());
create policy "admin writes weeks" on public.survivor_weeks
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "entrants read results" on public.survivor_results
  for select to authenticated using (public.survivor_is_entrant() or public.is_admin());
create policy "admin writes results" on public.survivor_results
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- picks: your own any time; everyone else's only once that week is locked or final
create policy "read survivor picks" on public.survivor_picks
  for select to authenticated using (
    user_id = auth.uid()
    or public.is_admin()
    or exists (
      select 1 from public.survivor_weeks w
      where w.week = survivor_picks.week and w.status in ('locked','final')
    )
  );

-- make, change, or clear your own pick only while that week is open
create policy "insert own pick while open" on public.survivor_picks
  for insert to authenticated with check (
    user_id = auth.uid() and public.survivor_is_entrant() and exists (
      select 1 from public.survivor_weeks w
      where w.week = survivor_picks.week and w.status = 'open'
    )
  );
create policy "update own pick while open" on public.survivor_picks
  for update to authenticated using (
    user_id = auth.uid() and exists (
      select 1 from public.survivor_weeks w
      where w.week = survivor_picks.week and w.status = 'open'
    )
  ) with check (
    user_id = auth.uid() and public.survivor_is_entrant() and exists (
      select 1 from public.survivor_weeks w
      where w.week = survivor_picks.week and w.status = 'open'
    )
  );
create policy "delete own pick while open" on public.survivor_picks
  for delete to authenticated using (
    user_id = auth.uid() and exists (
      select 1 from public.survivor_weeks w
      where w.week = survivor_picks.week and w.status = 'open'
    )
  );

-- admin can correct any pick (commissioner overrides)
create policy "admin writes picks" on public.survivor_picks
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

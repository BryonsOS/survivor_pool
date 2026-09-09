-- Rolling locks: each team closes at its own kickoff, everyone else at Sunday 1 PM.
--
-- Locking the whole week at Thursday's kickoff punished the fourteen games nobody
-- had picked yet. Now a team is pickable until its game starts, and the week's
-- deadline is Sunday 1:00 PM Eastern for everything still on the board.
--
-- The rule that makes this fair: once your team has kicked off, your pick is
-- frozen. Nobody watches Thursday night lose and quietly moves to a Sunday team.
--
-- Both halves live in the trigger, not the UI, so they hold however a pick is
-- submitted. The commissioner is exempt from the kickoff rules only — correcting
-- a pick after the fact is a real need — but still cannot set a bye-week team.

create or replace function public.survivor_game_started(p_week int, p_team text)
returns boolean
language sql stable
set search_path = public
as $fn$
  select exists (
    select 1 from public.survivor_games g
    where g.week = p_week
      and (g.home = p_team or g.away = p_team)
      and g.kickoff_at is not null
      and g.kickoff_at <= now()
  );
$fn$;

grant execute on function public.survivor_game_started(int, text) to authenticated;

create or replace function public.survivor_check_pick_playable()
returns trigger
language plpgsql
set search_path = public
as $fn$
declare
  gate boolean;
  has_paid boolean;
  -- pg_cron, the service role and the commissioner all get past the kickoff rules
  exempt boolean := auth.uid() is null or public.is_admin();
begin
  if tg_op = 'DELETE' then
    if not exempt and old.team is not null
       and public.survivor_game_started(old.week, old.team) then
      raise exception 'Your pick is locked: that game has already started'
        using errcode = 'check_violation';
    end if;
    return old;
  end if;

  select require_payment_to_pick into gate from public.survivor_settings limit 1;
  if coalesce(gate, false) then
    select paid into has_paid from public.survivor_entrants where user_id = new.user_id;
    if not coalesce(has_paid, false) then
      raise exception 'Entry fee has not been recorded for this player yet'
        using errcode = 'check_violation';
    end if;
  end if;

  -- Moving off a team whose game is underway is the one thing this must stop.
  if tg_op = 'UPDATE' and not exempt and old.team is not null
     and (new.team is distinct from old.team or new.is_bye is distinct from old.is_bye)
     and public.survivor_game_started(old.week, old.team) then
    raise exception 'Your pick is locked: that game has already started'
      using errcode = 'check_violation';
  end if;

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

  if not exempt and public.survivor_game_started(new.week, new.team) then
    raise exception 'Team % has already kicked off this week', new.team
      using errcode = 'check_violation';
  end if;

  return new;
end;
$fn$;

drop trigger if exists survivor_picks_playable on public.survivor_picks;
create trigger survivor_picks_playable
  before insert or update or delete on public.survivor_picks
  for each row execute function public.survivor_check_pick_playable();

-- Every week now closes on its Sunday at 1:00 PM Eastern. The season's Sundays
-- are seven days apart from Sept 13, 2026; building each one as a local time and
-- then attaching the zone keeps 1 PM meaning 1 PM across the November clock change.
update public.survivor_weeks
   set locks_at = ((date '2026-09-13' + (week - 1) * 7) + time '13:00')
                  at time zone 'America/New_York';

update public.survivor_settings
   set pick_deadline_label = 'kickoff for each team, and Sunday 1:00 PM ET for everyone else';

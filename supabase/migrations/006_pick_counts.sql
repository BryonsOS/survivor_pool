-- Live pick distribution, the way Splash Sports shows it.
--
-- RLS hides other players' picks until a week locks, and that stays true: this
-- returns counts per team only, never who. Entrants can see how the pool is
-- leaning without seeing anyone's name.

alter table public.survivor_settings
  add column show_pick_counts boolean not null default true;

create or replace function public.survivor_pick_counts(p_week int)
returns table (team text, picks int)
language plpgsql stable security definer
set search_path = public
as $fn$
declare
  visible boolean;
  locked boolean;
begin
  -- only members of this pool, and only when the commissioner allows it
  if not (public.survivor_is_entrant() or public.is_admin()) then
    return;
  end if;

  select show_pick_counts into visible from public.survivor_settings limit 1;
  select status in ('locked', 'final') into locked
    from public.survivor_weeks where week = p_week;

  -- Once a week is locked the individual picks are public anyway, so counts are
  -- always allowed then; before that they depend on the setting.
  if not coalesce(locked, false) and not coalesce(visible, true) then
    return;
  end if;

  return query
    select sp.team, count(*)::int
    from public.survivor_picks sp
    where sp.week = p_week and sp.team is not null
    group by sp.team;
end;
$fn$;

grant execute on function public.survivor_pick_counts(int) to authenticated;
revoke execute on function public.survivor_pick_counts(int) from anon, public;

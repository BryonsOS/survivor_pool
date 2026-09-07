-- The deadline holds the door, not the commissioner.
--
-- Until now a pick was allowed whenever the week's status was 'open', and the
-- countdown players saw was decoration: the week only really closed when the
-- commissioner flipped it to 'locked' by hand. Miss that moment on a Thursday
-- night and anyone could watch the game, then change their pick.
--
-- Now locks_at is the gate. The commissioner still marks weeks locked and final
-- to move the season along and to reveal everyone's picks, but nothing depends
-- on them being awake at kickoff. Moving a deadline in Admin -> Weeks still works
-- and still takes effect immediately, which is the escape hatch when a week
-- genuinely needs longer.
--
-- A week with no deadline set (the league has not scheduled its first kickoff)
-- stays open, as it did before.

create or replace function public.survivor_week_accepts_picks(p_week int)
returns boolean
language sql stable
set search_path = public
as $fn$
  select exists (
    select 1 from public.survivor_weeks w
    where w.week = p_week
      and w.status = 'open'
      and (w.locks_at is null or now() < w.locks_at)
  );
$fn$;

grant execute on function public.survivor_week_accepts_picks(int) to authenticated;

drop policy "insert own pick while open" on public.survivor_picks;
drop policy "update own pick while open" on public.survivor_picks;
drop policy "delete own pick while open" on public.survivor_picks;

create policy "insert own pick before deadline" on public.survivor_picks
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.survivor_is_entrant()
    and public.survivor_week_accepts_picks(week)
  );

create policy "update own pick before deadline" on public.survivor_picks
  for update to authenticated
  using (user_id = auth.uid() and public.survivor_week_accepts_picks(week))
  with check (
    user_id = auth.uid()
    and public.survivor_is_entrant()
    and public.survivor_week_accepts_picks(week)
  );

create policy "delete own pick before deadline" on public.survivor_picks
  for delete to authenticated
  using (user_id = auth.uid() and public.survivor_week_accepts_picks(week));

-- The commissioner's own policy is untouched: correcting a pick after the fact
-- is a real need, and it is already limited to admins.

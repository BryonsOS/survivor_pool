-- Pool-specific team names.
--
-- profiles.display_name is shared with the fantasy-wrestling league, so renaming
-- yourself here would rename you there. Give each entry its own optional team name
-- that only this pool uses; when it is blank the display name is used instead.

alter table public.survivor_entrants
  add column team_name text,
  add constraint survivor_team_name_length
    check (team_name is null or char_length(btrim(team_name)) between 1 and 30);

-- Writes to survivor_entrants stay admin-only (the `paid` flag lives on this table
-- and players must not be able to set it). A definer function lets a player change
-- their own team name and nothing else.
create or replace function public.survivor_set_team_name(name text)
returns text
language plpgsql security definer
set search_path = public
as $fn$
declare
  cleaned text;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  cleaned := nullif(btrim(coalesce(name, '')), '');
  if cleaned is not null and char_length(cleaned) > 30 then
    raise exception 'Team name must be 30 characters or fewer';
  end if;

  update public.survivor_entrants
    set team_name = cleaned
    where user_id = auth.uid();

  if not found then
    raise exception 'You are not entered in this pool';
  end if;

  return cleaned;
end;
$fn$;

grant execute on function public.survivor_set_team_name(text) to authenticated;
revoke execute on function public.survivor_set_team_name(text) from anon, public;

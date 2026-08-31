-- Entry-fee tracking.
--
-- The site never handles money. Players pay the commissioner directly through
-- whatever link is configured (Venmo, Cash App, PayPal), and the commissioner
-- marks them paid here. This is bookkeeping, not payment processing.

alter table public.survivor_settings
  add column payment_handle text,
  add column payment_url text,
  add column payment_instructions text not null
    default 'Pay the commissioner your entry fee before Week 1.',
  -- Off by default: turning it on blocks unpaid entrants from locking a pick.
  add column require_payment_to_pick boolean not null default false;

alter table public.survivor_entrants
  add column paid_at timestamptz,
  add column payment_note text;

-- Stamp when someone was marked paid, so "who paid and when" is answerable
-- without the commissioner keeping a separate list.
create or replace function public.survivor_stamp_paid()
returns trigger
language plpgsql
set search_path = public
as $fn$
begin
  if new.paid and not coalesce(old.paid, false) then
    new.paid_at := now();
  elsif not new.paid then
    new.paid_at := null;
    new.payment_note := null;
  end if;
  return new;
end;
$fn$;

create trigger survivor_entrants_stamp_paid
  before update on public.survivor_entrants
  for each row execute function public.survivor_stamp_paid();

revoke execute on function public.survivor_stamp_paid() from anon, authenticated, public;

-- Extends the existing pick guard: a bye team still cannot be picked, and when
-- the commissioner turns on require_payment_to_pick, neither can an unpaid entry.
-- Enforced here rather than in the UI so it holds however the pick is submitted.
create or replace function public.survivor_check_pick_playable()
returns trigger
language plpgsql
set search_path = public
as $fn$
declare
  gate boolean;
  has_paid boolean;
begin
  select require_payment_to_pick into gate from public.survivor_settings limit 1;
  if coalesce(gate, false) then
    select paid into has_paid from public.survivor_entrants where user_id = new.user_id;
    if not coalesce(has_paid, false) then
      raise exception 'Entry fee has not been recorded for this player yet'
        using errcode = 'check_violation';
    end if;
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

  return new;
end;
$fn$;

revoke execute on function public.survivor_check_pick_playable() from anon, authenticated, public;

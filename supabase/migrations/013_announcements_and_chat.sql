-- Two ways for the commissioner to reach everyone from inside the site.
--
-- An announcement shows at the top of the pick page until it is cleared: the
-- one place every player looks every week, at the moment a rule change or a
-- "pay up" actually matters. The chat link is for everything else — it sits on
-- the same page so latecomers find the group without being sent the link.
--
-- Both are plain settings, so the existing policies apply: members read,
-- the commissioner writes.

alter table public.survivor_settings
  add column announcement text,
  add column chat_url text;

update public.survivor_settings
   set chat_url = 'https://groupme.com/join_group/117370740/e8xeg0Oc';

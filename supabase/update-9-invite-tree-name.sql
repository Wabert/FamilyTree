-- Family Reunion: update 9. Run once in the Supabase SQL Editor, after update 8.
--
-- Lets the invite screen say which tree the invite is for ("You're invited to
-- join The Marek Family"). Given a valid invite code, this returns only that
-- tree's name: nothing about its people or members. A wrong or reset code
-- returns nothing. Safe to run again.

begin;

create or replace function public.invite_tree_name(code text)
returns text
language sql security definer stable
set search_path = public
as $$
  select name from families where invite_code = lower(trim(code));
$$;

revoke all on function public.invite_tree_name(text) from public;
grant execute on function public.invite_tree_name(text) to anon, authenticated;

commit;

-- Family Reunion: update 2. Run once in the Supabase SQL Editor on a project
-- that was set up with schema.sql before this update existed.
--
-- Adds: a nickname for each person, and the organizer's tools (see everyone who
-- joined, remove a member, reset the invite link). It runs as one transaction
-- and is safe to run again.

begin;

-- Nicknames --------------------------------------------------------------

alter table public.people
  add column if not exists nickname text check (char_length(nickname) <= 60);
grant update (nickname) on public.people to authenticated;

-- Organizer tools --------------------------------------------------------

-- Everyone who has joined a family, with their email if they signed in with one.
create or replace function public.list_family_members(fid uuid)
returns table (
  user_id   uuid,
  email     text,
  is_guest  boolean,
  role      text,
  person_id uuid,
  joined_at timestamptz
)
language sql security definer stable
set search_path = public
as $$
  select m.user_id, u.email::text, coalesce(u.is_anonymous, false), m.role, m.person_id, m.joined_at
  from family_members m
  join auth.users u on u.id = m.user_id
  where m.family_id = fid and public.is_family_organizer(fid)
  order by m.joined_at, m.user_id;
$$;

-- Takes away a member's access. The people they added stay in the tree.
create or replace function public.remove_family_member(fid uuid, member uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.is_family_organizer(fid) then
    raise exception 'Only an organizer can remove members';
  end if;
  if member = auth.uid() then
    raise exception 'You cannot remove yourself';
  end if;
  delete from family_members
  where family_id = fid and user_id = member and role <> 'organizer';
end;
$$;

-- Replaces the invite code, so the old link and QR code stop working.
create or replace function public.reset_invite_code(fid uuid)
returns text
language plpgsql security definer
set search_path = public
as $$
declare
  code text;
begin
  if not public.is_family_organizer(fid) then
    raise exception 'Only an organizer can reset the invite link';
  end if;
  update families
  set invite_code = substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)
  where id = fid
  returning invite_code into code;
  return code;
end;
$$;

revoke all on function public.list_family_members(uuid), public.remove_family_member(uuid, uuid),
  public.reset_invite_code(uuid)
  from public, anon;
grant execute on function public.list_family_members(uuid), public.remove_family_member(uuid, uuid),
  public.reset_invite_code(uuid)
  to authenticated;

-- Lets a removed member's screen close straight away.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'family_members'
  ) then
    alter publication supabase_realtime add table public.family_members;
  end if;
end;
$$;

commit;

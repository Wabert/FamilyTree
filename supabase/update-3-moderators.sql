-- Family Reunion: update 3. Run once in the Supabase SQL Editor, after update 2.
--
-- Adds moderators: members the organizer trusts to do what the organizer can
-- (see and remove members, remove anyone from the tree, rename the tree, reset
-- the invite link). Only the organizer can make or unmake a moderator, and
-- nobody can remove or change the organizer. Runs as one transaction and is
-- safe to run again.

begin;

alter table public.family_members drop constraint if exists family_members_role_check;
alter table public.family_members
  add constraint family_members_role_check check (role in ('organizer', 'moderator', 'member'));

-- True for the organizer and for moderators.
create or replace function public.is_family_manager(fid uuid)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from family_members
    where family_id = fid and user_id = auth.uid() and role in ('organizer', 'moderator')
  );
$$;

-- Access rules that used to be organizer-only now include moderators.
drop policy if exists "organizers rename their family" on public.families;
drop policy if exists "managers rename their family" on public.families;
create policy "managers rename their family" on public.families
  for update to authenticated
  using (public.is_family_manager(id)) with check (public.is_family_manager(id));

drop policy if exists "organizers or the person who added them remove people" on public.people;
drop policy if exists "managers or the person who added them remove people" on public.people;
create policy "managers or the person who added them remove people" on public.people
  for delete to authenticated
  using (public.is_family_manager(family_id) or created_by = auth.uid());

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
  where m.family_id = fid and public.is_family_manager(fid)
  order by m.joined_at, m.user_id;
$$;

-- Moderators can remove regular members. Only the organizer can remove a
-- moderator, and the organizer can't be removed by anyone.
create or replace function public.remove_family_member(fid uuid, member uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  my_role text;
  their_role text;
begin
  select role into my_role from family_members where family_id = fid and user_id = auth.uid();
  if my_role is null or my_role not in ('organizer', 'moderator') then
    raise exception 'Only the organizer or a moderator can remove members';
  end if;
  if member = auth.uid() then
    raise exception 'You cannot remove yourself';
  end if;
  select role into their_role from family_members where family_id = fid and user_id = member;
  if their_role is null then
    return;
  end if;
  if their_role = 'organizer' then
    raise exception 'The organizer cannot be removed';
  end if;
  if their_role = 'moderator' and my_role <> 'organizer' then
    raise exception 'Only the organizer can remove a moderator';
  end if;
  delete from family_members where family_id = fid and user_id = member;
end;
$$;

create or replace function public.reset_invite_code(fid uuid)
returns text
language plpgsql security definer
set search_path = public
as $$
declare
  code text;
begin
  if not public.is_family_manager(fid) then
    raise exception 'Only the organizer or a moderator can reset the invite link';
  end if;
  update families
  set invite_code = substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)
  where id = fid
  returning invite_code into code;
  return code;
end;
$$;

-- Only the organizer hands out or takes back moderator status.
create or replace function public.set_member_role(fid uuid, member uuid, new_role text)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.is_family_organizer(fid) then
    raise exception 'Only the organizer can change who is a moderator';
  end if;
  if new_role not in ('moderator', 'member') then
    raise exception 'Unknown role';
  end if;
  update family_members
  set role = new_role
  where family_id = fid and user_id = member and role <> 'organizer';
end;
$$;

revoke all on function public.is_family_manager(uuid), public.set_member_role(uuid, uuid, text)
  from public, anon;
grant execute on function public.is_family_manager(uuid), public.set_member_role(uuid, uuid, text)
  to authenticated;

commit;

-- Family Reunion: update 5. Run once in the Supabase SQL Editor, after update 4.
--
-- Only approved accounts can start a new family tree. Everyone else can still
-- sign in, join a tree with an invite link or code, and add and edit people in
-- it, exactly as before. The list of approved accounts can't be read or
-- changed from the app; it is managed here in the SQL Editor. Runs as one
-- transaction and is safe to run again.

begin;

create table if not exists public.tree_creators (
  user_id  uuid primary key references auth.users (id) on delete cascade,
  added_at timestamptz not null default now()
);
alter table public.tree_creators enable row level security;
-- No policies on purpose: the app can't see or change this list.
revoke all on public.tree_creators from public, anon, authenticated;

-- True when the signed-in account may start new family trees.
create or replace function public.can_create_family()
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (select 1 from tree_creators where user_id = auth.uid());
$$;

-- Creating a family also makes the creator its organizer.
create or replace function public.create_family(family_name text)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  fid uuid;
begin
  if auth.uid() is null then
    raise exception 'You need to be signed in';
  end if;
  if not public.can_create_family() then
    raise exception 'Only the site owner can start a new family tree. Ask whoever invited you for an invite link.';
  end if;
  insert into families (name, created_by)
  values (trim(family_name), auth.uid())
  returning id into fid;
  insert into family_members (family_id, user_id, role)
  values (fid, auth.uid(), 'organizer');
  return fid;
end;
$$;

revoke all on function public.can_create_family(), public.create_family(text) from public, anon;
grant execute on function public.can_create_family(), public.create_family(text) to authenticated;

commit;

-- ---------------------------------------------------------------------------
-- Approving an account. Run this on its own, with the email you sign in with
-- (the account must have signed in at least once):
--
--   insert into public.tree_creators (user_id)
--   select id from auth.users where lower(email) = lower('you@example.com')
--   on conflict do nothing;
--
-- To see who is approved:
--
--   select u.email, c.added_at from public.tree_creators c join auth.users u on u.id = c.user_id;
--
-- To take approval away, delete their row from public.tree_creators.
-- ---------------------------------------------------------------------------

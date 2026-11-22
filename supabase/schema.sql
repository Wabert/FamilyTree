-- Family Reunion: database setup for Supabase.
--
-- Paste this whole file into the Supabase SQL Editor and press Run, once, on a
-- new project. It runs as a single transaction: if anything fails, nothing is
-- changed and it is safe to fix and run again.
--
-- On a new project, run update-3-moderators.sql and then
-- update-4-photo-gallery.sql straight after this file: they add the moderator
-- role and each person's extra photos on top of what is set up here. (update-2
-- is already included below and is only for projects created before it existed.)
--
-- It mirrors src/lib/types.ts: people, plus the two kinds of link we store
-- (parent -> child, and spouse). Every other relationship is calculated.

begin;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- One row per family tree. `invite_code` goes in the join link / QR code.
create table public.families (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 120),
  invite_code text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
  created_by  uuid default auth.uid() references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

-- A person in the tree. They exist whether or not anyone signs in as them.
create table public.people (
  id         uuid primary key default gen_random_uuid(),
  family_id  uuid not null references public.families (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 200),
  nickname   text check (char_length(nickname) <= 60),
  gender    text check (gender in ('male', 'female', 'other')),
  birth_year int,
  death_year int,
  photo_path text,            -- path inside the private "photos" storage bucket
  location   text,
  bio        text,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (id, family_id),     -- lets links insist both people are in the same family
  check (death_year is null or birth_year is null or death_year >= birth_year)
);
create index people_family_idx on public.people (family_id);

create table public.parent_links (
  family_id uuid not null,
  parent_id uuid not null,
  child_id  uuid not null,
  primary key (parent_id, child_id),
  foreign key (parent_id, family_id) references public.people (id, family_id) on delete cascade,
  foreign key (child_id, family_id) references public.people (id, family_id) on delete cascade,
  check (parent_id <> child_id)
);
create index parent_links_family_idx on public.parent_links (family_id);
create index parent_links_child_idx on public.parent_links (child_id);

-- Stored once per couple with the smaller id first, so (a, b) and (b, a) can't both exist.
create table public.spouse_links (
  family_id uuid not null,
  a_id      uuid not null,
  b_id      uuid not null,
  primary key (a_id, b_id),
  foreign key (a_id, family_id) references public.people (id, family_id) on delete cascade,
  foreign key (b_id, family_id) references public.people (id, family_id) on delete cascade,
  check (a_id < b_id)
);
create index spouse_links_family_idx on public.spouse_links (family_id);
create index spouse_links_b_idx on public.spouse_links (b_id);

-- Who has joined which family, and which person in the tree they say they are.
create table public.family_members (
  family_id uuid not null references public.families (id) on delete cascade,
  user_id   uuid not null references auth.users (id) on delete cascade,
  person_id uuid references public.people (id) on delete set null,
  role      text not null default 'member' check (role in ('organizer', 'member')),
  joined_at timestamptz not null default now(),
  primary key (family_id, user_id)
);
create index family_members_user_idx on public.family_members (user_id);

-- ---------------------------------------------------------------------------
-- Helper functions used by the access rules
-- ---------------------------------------------------------------------------

create function public.is_family_member(fid uuid)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from family_members
    where family_id = fid and user_id = auth.uid()
  );
$$;

create function public.is_family_organizer(fid uuid)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from family_members
    where family_id = fid and user_id = auth.uid() and role = 'organizer'
  );
$$;

-- Photos are stored as "<family id>/<file>", so the folder name decides access.
create function public.is_family_folder_member(folder text)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from family_members
    where family_id::text = folder and user_id = auth.uid()
  );
$$;

-- Creating a family also makes the creator its organizer.
create function public.create_family(family_name text)
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
  insert into families (name, created_by)
  values (trim(family_name), auth.uid())
  returning id into fid;
  insert into family_members (family_id, user_id, role)
  values (fid, auth.uid(), 'organizer');
  return fid;
end;
$$;

-- Joining goes through a function so the invite code is checked on the server:
-- nobody can add themselves to a family they weren't invited to.
create function public.join_family(code text)
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
  select id into fid from families where invite_code = lower(trim(code));
  if fid is null then
    raise exception 'Invite code not found';
  end if;
  insert into family_members (family_id, user_id)
  values (fid, auth.uid())
  on conflict do nothing;
  return fid;
end;
$$;

-- Organizer tools: see everyone who joined, remove a member, reset the invite link.

create function public.list_family_members(fid uuid)
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
create function public.remove_family_member(fid uuid, member uuid)
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
create function public.reset_invite_code(fid uuid)
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

-- ---------------------------------------------------------------------------
-- Permissions: start from nothing, then grant exactly what the app needs.
-- Column-level UPDATE grants stop anyone promoting themselves to organizer or
-- moving a person into another family.
-- ---------------------------------------------------------------------------

revoke all on public.families, public.people, public.parent_links, public.spouse_links, public.family_members
  from anon, authenticated;

grant select on public.families, public.people, public.parent_links, public.spouse_links, public.family_members
  to authenticated;
grant update (name) on public.families to authenticated;
grant insert, delete on public.people, public.parent_links, public.spouse_links to authenticated;
grant update (name, nickname, gender, birth_year, death_year, photo_path, location, bio) on public.people to authenticated;
grant update (person_id) on public.family_members to authenticated;

revoke all on function public.is_family_member(uuid), public.is_family_organizer(uuid),
  public.is_family_folder_member(text), public.create_family(text), public.join_family(text),
  public.list_family_members(uuid), public.remove_family_member(uuid, uuid), public.reset_invite_code(uuid)
  from public, anon;
grant execute on function public.is_family_member(uuid), public.is_family_organizer(uuid),
  public.is_family_folder_member(text), public.create_family(text), public.join_family(text),
  public.list_family_members(uuid), public.remove_family_member(uuid, uuid), public.reset_invite_code(uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Row-level security: you can only see and change families you have joined.
-- ---------------------------------------------------------------------------

alter table public.families       enable row level security;
alter table public.people         enable row level security;
alter table public.parent_links   enable row level security;
alter table public.spouse_links   enable row level security;
alter table public.family_members enable row level security;

create policy "members read their family" on public.families
  for select to authenticated using (public.is_family_member(id));
create policy "organizers rename their family" on public.families
  for update to authenticated
  using (public.is_family_organizer(id)) with check (public.is_family_organizer(id));

create policy "members read people" on public.people
  for select to authenticated using (public.is_family_member(family_id));
create policy "members add people" on public.people
  for insert to authenticated
  with check (public.is_family_member(family_id) and created_by = auth.uid());
create policy "members edit people" on public.people
  for update to authenticated
  using (public.is_family_member(family_id)) with check (public.is_family_member(family_id));
create policy "organizers or the person who added them remove people" on public.people
  for delete to authenticated
  using (public.is_family_organizer(family_id) or created_by = auth.uid());

create policy "members read parent links" on public.parent_links
  for select to authenticated using (public.is_family_member(family_id));
create policy "members add parent links" on public.parent_links
  for insert to authenticated with check (public.is_family_member(family_id));
create policy "members remove parent links" on public.parent_links
  for delete to authenticated using (public.is_family_member(family_id));

create policy "members read spouse links" on public.spouse_links
  for select to authenticated using (public.is_family_member(family_id));
create policy "members add spouse links" on public.spouse_links
  for insert to authenticated with check (public.is_family_member(family_id));
create policy "members remove spouse links" on public.spouse_links
  for delete to authenticated using (public.is_family_member(family_id));

create policy "members see who has joined" on public.family_members
  for select to authenticated using (public.is_family_member(family_id));
create policy "members say which person they are" on public.family_members
  for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (
      person_id is null
      or exists (
        select 1 from public.people p
        where p.id = person_id and p.family_id = family_members.family_id
      )
    )
  );

-- ---------------------------------------------------------------------------
-- Live updates: when one person adds a relative, everyone's tree refreshes.
-- ---------------------------------------------------------------------------

alter publication supabase_realtime
  add table public.families, public.people, public.parent_links, public.spouse_links, public.family_members;

-- ---------------------------------------------------------------------------
-- Photos: a private bucket, readable and writable only by the family's members.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 1048576, array['image/jpeg'])
on conflict (id) do nothing;

create policy "family members view photos" on storage.objects
  for select to authenticated
  using (bucket_id = 'photos' and public.is_family_folder_member((storage.foldername(name))[1]));
create policy "family members add photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'photos' and public.is_family_folder_member((storage.foldername(name))[1]));
create policy "family members remove photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'photos' and public.is_family_folder_member((storage.foldername(name))[1]));

commit;

-- Family Reunion: update 6. Run once in the Supabase SQL Editor, after update 5.
--
-- Keeps a log of every change anyone makes: people added, edited or removed,
-- parent and spouse links, people joining or leaving a tree, "This is me",
-- roles, and tree renames. Each row says when, which tree, who did it, what
-- they did, and (for edits) each field's old and new value.
-- Removing a person also logs the parent and spouse links removed with them.
--
-- The log lives in its own "audit" schema, which the app and the public API
-- can't reach: nobody using the site can read or change it, including
-- organizers. You see it in the dashboard: Table Editor -> schema "audit" ->
-- "changes_newest_first". Runs as one transaction and is safe to run again.

begin;

create schema if not exists audit;
revoke all on schema audit from public, anon, authenticated;

create table if not exists audit.changes (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  tree        text,          -- the tree's name at the time
  who         text,          -- email, or for guests the person they said they are
  action      text not null, -- e.g. "edited person"
  subject     text,          -- e.g. the person's name, or "Ann -> parent of -> Bob"
  details     jsonb,         -- edits: {field: {from, to}}; removals: what was removed
  family_id   uuid,
  user_id     uuid
);
-- Second lock: no policies, so app roles see nothing even if granted access.
alter table audit.changes enable row level security;
create index if not exists changes_at_idx on audit.changes (at desc);
create index if not exists changes_family_idx on audit.changes (family_id, at desc);
revoke all on audit.changes from public, anon, authenticated;

-- Who is making the current change, as a readable label.
create or replace function audit.who(fid uuid)
returns text
language sql security definer stable
set search_path = public
as $$
  select case
    when auth.uid() is null then 'database admin'
    else coalesce(
      (select u.email::text from auth.users u where u.id = auth.uid() and u.email is not null and u.email <> ''),
      (select 'guest: ' || p.name
         from family_members m join people p on p.id = m.person_id
         where m.family_id = fid and m.user_id = auth.uid()),
      'guest ' || left(auth.uid()::text, 8)
    )
  end;
$$;

create or replace function audit.person_name(pid uuid)
returns text
language sql security definer stable
set search_path = public
as $$
  select coalesce((select name from people where id = pid), 'someone since removed');
$$;

-- Fields that changed between two versions of a row: {field: {from, to}}.
create or replace function audit.diff(old_row jsonb, new_row jsonb)
returns jsonb
language sql immutable
as $$
  select coalesce(jsonb_object_agg(n.key, jsonb_build_object('from', o.value, 'to', n.value)), '{}'::jsonb)
  from jsonb_each(new_row) n
  join jsonb_each(old_row) o using (key)
  where o.value is distinct from n.value;
$$;

create or replace function audit.log_change()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  o jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  n jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  r jsonb := coalesce(n, o);
  fid uuid;
  verb text := case tg_op when 'INSERT' then 'added' when 'UPDATE' then 'edited' else 'removed' end;
  act text;
  subj text;
  det jsonb;
begin
  fid := case when tg_table_name = 'families' then (r ->> 'id')::uuid else (r ->> 'family_id')::uuid end;

  if tg_op = 'UPDATE' then
    det := audit.diff(o, n) - 'invite_code';
    if det = '{}'::jsonb then
      -- Nothing worth logging changed (e.g. only the invite link was reset).
      if tg_table_name = 'families' and o ->> 'invite_code' is distinct from n ->> 'invite_code' then
        det := jsonb_build_object('invite_link', 'reset');
      else
        return null;
      end if;
    end if;
  else
    det := jsonb_strip_nulls(r) - 'family_id';
  end if;

  case tg_table_name
    when 'people' then
      act := verb || ' person';
      subj := coalesce(n ->> 'name', o ->> 'name');
      det := det - 'id' - 'created_by' - 'created_at';
    when 'parent_links' then
      act := verb || ' parent link';
      subj := audit.person_name((r ->> 'parent_id')::uuid) || ' -> parent of -> ' || audit.person_name((r ->> 'child_id')::uuid);
      det := null;
    when 'spouse_links' then
      act := verb || ' spouse link';
      subj := audit.person_name((r ->> 'a_id')::uuid) || ' <-> ' || audit.person_name((r ->> 'b_id')::uuid);
      det := null;
    when 'family_members' then
      act := case tg_op when 'INSERT' then 'joined tree' when 'DELETE' then 'left or removed from tree' else 'edited membership' end;
      subj := coalesce((select coalesce(u.email::text, 'guest ' || left(u.id::text, 8)) from auth.users u where u.id = (r ->> 'user_id')::uuid),
                       'account ' || left(r ->> 'user_id', 8));
      if tg_op = 'UPDATE' and det ? 'person_id' then
        det := det - 'person_id' || jsonb_build_object('this_is_me', jsonb_build_object(
          'from', case when o ->> 'person_id' is not null then audit.person_name((o ->> 'person_id')::uuid) end,
          'to',   case when n ->> 'person_id' is not null then audit.person_name((n ->> 'person_id')::uuid) end));
      end if;
      det := det - 'person_id' - 'user_id' - 'joined_at';
    when 'families' then
      act := case tg_op when 'INSERT' then 'created tree' when 'DELETE' then 'deleted tree' else 'edited tree' end;
      subj := coalesce(n ->> 'name', o ->> 'name');
      det := det - 'id' - 'invite_code' - 'created_by' - 'created_at';
  end case;

  insert into audit.changes (tree, who, action, subject, details, family_id, user_id)
  values (
    coalesce((select name from families where id = fid), o ->> 'name'),
    audit.who(fid),
    act,
    subj,
    nullif(det, '{}'::jsonb),
    fid,
    auth.uid()
  );
  return null;
end;
$$;

revoke all on all functions in schema audit from public, anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['people', 'parent_links', 'spouse_links', 'family_members', 'families'] loop
    execute format('drop trigger if exists log_changes on public.%I', t);
    execute format(
      'create trigger log_changes after insert or update or delete on public.%I for each row execute function audit.log_change()',
      t);
  end loop;
end;
$$;

-- The same log, newest first, for reading in the dashboard.
create or replace view audit.changes_newest_first as
  select at, tree, who, action, subject, details
  from audit.changes
  order by at desc, id desc;
revoke all on audit.changes_newest_first from public, anon, authenticated;

commit;

-- To read it in the SQL Editor instead, for one tree:
--   select * from audit.changes_newest_first where tree = 'The ______ Family' limit 200;

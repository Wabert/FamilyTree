-- Family Reunion: update 8. Run once in the Supabase SQL Editor, after update 7.
--
-- Couples get a status and years: married, divorced, or partners who never
-- married, plus the year they married or got together and the year they
-- divorced. Every existing couple starts as "married" with no years, so the
-- tree looks the same until someone edits a couple. A marriage that ended
-- because someone died stays "married": their death year says the rest.
--
-- Also lets members change a couple's status and years (before, couples could
-- only be added or removed), and makes the change log record those changes.
-- Runs as one transaction and is safe to run again.

begin;

alter table public.spouse_links
  add column if not exists status text not null default 'married',
  add column if not exists start_year int,
  add column if not exists end_year int;

alter table public.spouse_links drop constraint if exists spouse_links_status_check;
alter table public.spouse_links
  add constraint spouse_links_status_check check (status in ('married', 'divorced', 'partners'));
alter table public.spouse_links drop constraint if exists spouse_links_years_check;
alter table public.spouse_links
  add constraint spouse_links_years_check
  check (end_year is null or start_year is null or end_year >= start_year);

grant update (status, start_year, end_year) on public.spouse_links to authenticated;

drop policy if exists "members edit spouse links" on public.spouse_links;
create policy "members edit spouse links" on public.spouse_links
  for update to authenticated
  using (public.is_family_member(family_id))
  with check (public.is_family_member(family_id));

-- The change log (update 6), now also recording a couple's status and years.
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
      det := det - 'a_id' - 'b_id';
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

commit;

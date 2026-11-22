-- Family Reunion: update 7. Run once in the Supabase SQL Editor, after update 6.
--
-- Lets the app's "Change history" screen read the change log from update 6,
-- for approved tree creators only (see update 5). Everyone else is refused by
-- the database, whatever the app shows. The log itself stays closed to the app
-- and the public API; this function is the only way in. Safe to run again.

begin;

create or replace function public.list_changes(fid uuid default null, before_id bigint default null, max_rows int default 100)
returns table (
  id        bigint,
  at        timestamptz,
  tree      text,
  who       text,
  action    text,
  subject   text,
  details   jsonb,
  family_id uuid
)
language plpgsql security definer stable
set search_path = public
as $$
begin
  if not public.can_create_family() then
    raise exception 'Only the site owner can see the change history';
  end if;
  return query
    select c.id, c.at, c.tree, c.who, c.action, c.subject, c.details, c.family_id
    from audit.changes c
    where (fid is null or c.family_id = fid)
      and (before_id is null or c.id < before_id)
    order by c.id desc
    limit least(greatest(coalesce(max_rows, 100), 1), 500);
end;
$$;

revoke all on function public.list_changes(uuid, bigint, int) from public, anon;
grant execute on function public.list_changes(uuid, bigint, int) to authenticated;

commit;

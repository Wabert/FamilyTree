-- Family Reunion: update 10. Run once in the Supabase SQL Editor, after update 9.
--
-- Guests (people who joined from an invite link without an email) can look at
-- the tree, say "This is me", and share the invite, but can't change the tree:
-- no adding, editing or removing people, parent or spouse links, or photos,
-- and no renaming the tree. Once a guest signs up with their email (the "Sign
-- up with email to make updates" option in the app), they can edit like any
-- other member.
--
-- Done with "restrictive" rules, which are checked on top of every existing
-- rule, so nothing that's already allowed for email accounts changes. Safe to
-- run again.

begin;

-- True when the signed-in account joined without an email.
create or replace function public.is_guest()
returns boolean
language sql stable
as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
$$;
grant execute on function public.is_guest() to anon, authenticated;

do $$
declare
  t text;
  op text;
  name text;
begin
  foreach t in array array['people', 'parent_links', 'spouse_links'] loop
    foreach op in array array['insert', 'update', 'delete'] loop
      name := format('guests cannot %s %s', op, replace(t, '_', ' '));
      execute format('drop policy if exists %I on public.%I', name, t);
      execute format(
        'create policy %I on public.%I as restrictive for %s to authenticated %s',
        name, t, op,
        case op
          when 'insert' then 'with check (not public.is_guest())'
          when 'update' then 'using (not public.is_guest()) with check (not public.is_guest())'
          else 'using (not public.is_guest())'
        end);
    end loop;
  end loop;
end;
$$;

drop policy if exists "guests cannot rename trees" on public.families;
create policy "guests cannot rename trees" on public.families
  as restrictive for update to authenticated
  using (not public.is_guest()) with check (not public.is_guest());

drop policy if exists "guests cannot add photos" on storage.objects;
create policy "guests cannot add photos" on storage.objects
  as restrictive for insert to authenticated
  with check (bucket_id <> 'photos' or not public.is_guest());

drop policy if exists "guests cannot remove photos" on storage.objects;
create policy "guests cannot remove photos" on storage.objects
  as restrictive for delete to authenticated
  using (bucket_id <> 'photos' or not public.is_guest());

commit;

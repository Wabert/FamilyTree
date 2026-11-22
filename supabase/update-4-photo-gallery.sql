-- Family Reunion: update 4. Run once in the Supabase SQL Editor, after update 3.
--
-- Lets each person have up to 4 extra photos, shown on their details screen,
-- besides their profile picture. The photos go in the same private "photos"
-- bucket, so the existing storage rules already cover them. Runs as one
-- transaction and is safe to run again.

begin;

alter table public.people
  add column if not exists gallery_paths text[] not null default '{}'
  check (cardinality(gallery_paths) <= 4);

-- Updates to people are granted column by column, so the new column needs its own grant.
grant update (gallery_paths) on public.people to authenticated;

commit;

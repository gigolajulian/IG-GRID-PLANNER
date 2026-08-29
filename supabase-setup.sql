-- Grid Planner — Supabase setup. Paste the whole file into the SQL Editor and Run.
--
-- Plans are stored as ONE JSON FILE PER ACCOUNT in Storage, not as database rows:
-- a plan carries its photos inline and runs to several MB, which is what object
-- storage is for and what a jsonb column is not. No tables are needed at all.
--
-- Every file lives under a folder named with your auth user id, and the policies
-- below allow a signed-in user to touch only their own folder. That is the entire
-- security model, and it has to be, because the anon key ships inside a public page.

-- 1. a private bucket for plan files
insert into storage.buckets (id, name, public)
values ('plans', 'plans', false)
on conflict (id) do nothing;

-- 2. drop the policies first so this file is safe to run more than once
drop policy if exists "plans owner read"   on storage.objects;
drop policy if exists "plans owner insert" on storage.objects;
drop policy if exists "plans owner update" on storage.objects;
drop policy if exists "plans owner delete" on storage.objects;

-- 3. a signed-in user may read/write only inside <their-uid>/...
create policy "plans owner read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'plans'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "plans owner insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'plans'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "plans owner update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'plans'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'plans'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "plans owner delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'plans'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Sanity check: this must return four rows.
select policyname from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and policyname like 'plans owner%';

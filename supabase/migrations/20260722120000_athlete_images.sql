insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('athlete-images', 'athlete-images', false, 5242880, array['image/jpeg'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users can read own athlete images" on storage.objects;
create policy "Users can read own athlete images"
on storage.objects for select
to authenticated
using (
  bucket_id = 'athlete-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Users can upload own athlete images" on storage.objects;
create policy "Users can upload own athlete images"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'athlete-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Users can update own athlete images" on storage.objects;
create policy "Users can update own athlete images"
on storage.objects for update
to authenticated
using (
  bucket_id = 'athlete-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'athlete-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Users can delete own athlete images" on storage.objects;
create policy "Users can delete own athlete images"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'athlete-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

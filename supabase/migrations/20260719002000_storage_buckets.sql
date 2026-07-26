-- Application Storage bucket definitions only; no Storage objects are seeded.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'chat-images',
    'chat-images',
    false,
    10485760,
    array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
  ),
  (
    'mentor-avatars',
    'mentor-avatars',
    true,
    5242880,
    array['image/png', 'image/jpeg', 'image/webp']
  )
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users can read own chat images" on storage.objects;
create policy "Users can read own chat images"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'chat-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users can upload own chat images" on storage.objects;
create policy "Users can upload own chat images"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'chat-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users can update own chat images" on storage.objects;
create policy "Users can update own chat images"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'chat-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'chat-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users can delete own chat images" on storage.objects;
create policy "Users can delete own chat images"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'chat-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users can upload own mentor avatars" on storage.objects;
create policy "Users can upload own mentor avatars"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'mentor-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users can update own mentor avatars" on storage.objects;
create policy "Users can update own mentor avatars"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'mentor-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'mentor-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users can delete own mentor avatars" on storage.objects;
create policy "Users can delete own mentor avatars"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'mentor-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

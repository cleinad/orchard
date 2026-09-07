begin;

-- The consolidated production baseline can contain the application buckets
-- without the cross-schema policies required for browser Storage operations.
-- Recreate the complete policy set in a forward migration so environments that
-- already recorded the baseline are repaired without rewriting migration history.

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

commit;

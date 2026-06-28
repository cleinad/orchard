insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'chat-images',
  'chat-images',
  false,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_bucket text not null default 'chat-images',
  storage_path text not null,
  file_name text not null,
  mime_type text not null check (mime_type in ('image/png', 'image/jpeg', 'image/webp', 'image/gif')),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 10485760),
  width integer,
  height integer,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (storage_bucket, storage_path)
);

create index if not exists idx_message_attachments_message_id
  on public.message_attachments(message_id, position);

create index if not exists idx_message_attachments_user_id
  on public.message_attachments(user_id);

alter table public.message_attachments enable row level security;

drop policy if exists "Users can view own message attachments" on public.message_attachments;
create policy "Users can view own message attachments"
  on public.message_attachments
  for select
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own message attachments" on public.message_attachments;
create policy "Users can insert own message attachments"
  on public.message_attachments
  for insert
  with check (
    (select auth.uid()) = user_id
    and storage_bucket = 'chat-images'
    and storage_path like (select auth.uid())::text || '/%'
    and (
      message_id is null
      or exists (
        select 1
        from public.messages
        where messages.id = message_attachments.message_id
          and messages.user_id = (select auth.uid())
      )
    )
  );

drop policy if exists "Users can delete own message attachments" on public.message_attachments;
create policy "Users can delete own message attachments"
  on public.message_attachments
  for delete
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can upload own chat images" on storage.objects;
create policy "Users can upload own chat images"
  on storage.objects
  for insert
  with check (
    bucket_id = 'chat-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users can read own chat images" on storage.objects;
create policy "Users can read own chat images"
  on storage.objects
  for select
  using (
    bucket_id = 'chat-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users can delete own chat images" on storage.objects;
create policy "Users can delete own chat images"
  on storage.objects
  for delete
  using (
    bucket_id = 'chat-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

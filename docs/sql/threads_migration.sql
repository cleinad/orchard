-- Inline Threads & Learning Mode migration
-- Applied via mcp__supabase__apply_migration (2026-03-09)

-- Create threads table
create table if not exists public.threads (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  source_message_id uuid not null references public.messages(id) on delete cascade,
  highlighted_text text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Add thread columns to messages
alter table public.messages
  add column if not exists thread_id uuid references public.threads(id) on delete cascade,
  add column if not exists parent_message_id uuid references public.messages(id) on delete set null;

-- Index for fetching threads by conversation
create index if not exists idx_threads_conversation_id on public.threads(conversation_id);

-- Index for fetching threads by source message
create index if not exists idx_threads_source_message_id on public.threads(source_message_id);

-- Index for fetching messages by thread
create index if not exists idx_messages_thread_id on public.messages(thread_id);

-- RLS policies for threads
alter table public.threads enable row level security;

create policy "Users can read own threads"
  on public.threads for select
  using (auth.uid() = user_id);

create policy "Users can insert own threads"
  on public.threads for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own threads"
  on public.threads for delete
  using (auth.uid() = user_id);

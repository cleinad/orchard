-- Conversation branches for transcript-native branching

alter table public.messages
  add column if not exists previous_message_id uuid references public.messages(id) on delete set null;

create index if not exists idx_messages_previous_message_id
  on public.messages(previous_message_id);

create table if not exists public.conversation_branches (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  source_message_id uuid not null references public.messages(id) on delete cascade,
  entry_message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  is_main boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_conversation_branches_conversation_id
  on public.conversation_branches(conversation_id);

create index if not exists idx_conversation_branches_source_message_id
  on public.conversation_branches(source_message_id);

create unique index if not exists idx_conversation_branches_entry_message_id
  on public.conversation_branches(entry_message_id);

create unique index if not exists idx_conversation_branches_main_per_source
  on public.conversation_branches(source_message_id)
  where is_main;

alter table public.conversation_branches enable row level security;

create policy "Users can read own conversation branches"
  on public.conversation_branches for select
  using (auth.uid() = user_id);

create policy "Users can insert own conversation branches"
  on public.conversation_branches for insert
  with check (auth.uid() = user_id);

create policy "Users can update own conversation branches"
  on public.conversation_branches for update
  using (auth.uid() = user_id);

create policy "Users can delete own conversation branches"
  on public.conversation_branches for delete
  using (auth.uid() = user_id);

create or replace function public.handle_conversation_branches_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists on_conversation_branches_updated on public.conversation_branches;

create trigger on_conversation_branches_updated
  before update on public.conversation_branches
  for each row execute function public.handle_conversation_branches_updated_at();

with ordered_main_messages as (
  select
    id,
    lag(id) over (
      partition by conversation_id
      order by created_at, id
    ) as previous_id
  from public.messages
  where thread_id is null
)
update public.messages as messages
set previous_message_id = ordered_main_messages.previous_id
from ordered_main_messages
where messages.id = ordered_main_messages.id
  and messages.previous_message_id is null;

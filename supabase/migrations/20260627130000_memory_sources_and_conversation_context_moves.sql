create table if not exists public.memory_item_sources (
  id uuid primary key default gen_random_uuid(),
  memory_item_id uuid not null references public.memory_items(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  message_id uuid references public.messages(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  source_role text check (source_role in ('user', 'assistant')),
  contribution_type text not null default 'extracted',
  created_at timestamptz not null default now(),
  unique nulls not distinct (memory_item_id, conversation_id, message_id, contribution_type)
);

create index if not exists idx_memory_item_sources_memory_item_id
  on public.memory_item_sources(memory_item_id);

create index if not exists idx_memory_item_sources_conversation_id
  on public.memory_item_sources(user_id, conversation_id);

create index if not exists idx_memory_item_sources_message_id
  on public.memory_item_sources(user_id, message_id);

alter table public.memory_item_sources enable row level security;

drop policy if exists "Users can view own memory item sources" on public.memory_item_sources;
create policy "Users can view own memory item sources"
  on public.memory_item_sources
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own memory item sources" on public.memory_item_sources;
create policy "Users can insert own memory item sources"
  on public.memory_item_sources
  for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.memory_items
      where memory_items.id = memory_item_sources.memory_item_id
        and memory_items.user_id = auth.uid()
    )
  );

drop policy if exists "Users can delete own memory item sources" on public.memory_item_sources;
create policy "Users can delete own memory item sources"
  on public.memory_item_sources
  for delete
  using (auth.uid() = user_id);

insert into public.memory_item_sources (
  memory_item_id,
  conversation_id,
  message_id,
  user_id,
  source_role,
  contribution_type,
  created_at
)
select
  id,
  source_conversation_id,
  source_message_id,
  user_id,
  source_role,
  'extracted',
  created_at
from public.memory_items
where source_conversation_id is not null
   or source_message_id is not null
on conflict (memory_item_id, conversation_id, message_id, contribution_type) do nothing;

create or replace function public.move_conversation_context(
  p_conversation_id uuid,
  p_workspace_id uuid default null,
  p_memory_policy text default 'conservative'
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_conversation record;
  v_target_workspace record;
  v_moved_memory_count integer := 0;
  v_left_memory_count integer := 0;
  v_source_owner_type text;
  v_source_owner_id uuid;
  v_updated_conversation record;
begin
  if v_user_id is null then
    return jsonb_build_object('error', 'unauthorized');
  end if;

  if p_memory_policy is distinct from 'conservative' then
    return jsonb_build_object('error', 'unsupported_memory_policy');
  end if;

  select id, user_id, title, mentor_id, workspace_id, created_at, updated_at
  into v_conversation
  from public.conversations
  where id = p_conversation_id
    and user_id = v_user_id
  for update;

  if not found then
    return jsonb_build_object('conversation_found', false);
  end if;

  if v_conversation.mentor_id is not null then
    return jsonb_build_object(
      'conversation_found', true,
      'error', 'mentor_context_unsupported'
    );
  end if;

  if v_conversation.workspace_id is not distinct from p_workspace_id then
    return jsonb_build_object(
      'conversation_found', true,
      'error', 'noop'
    );
  end if;

  if p_workspace_id is not null then
    select id
    into v_target_workspace
    from public.workspaces
    where id = p_workspace_id
      and user_id = v_user_id;

    if not found then
      return jsonb_build_object(
        'conversation_found', true,
        'target_workspace_found', false
      );
    end if;
  end if;

  v_source_owner_type := case
    when v_conversation.workspace_id is null then 'global'
    else 'workspace'
  end;
  v_source_owner_id := v_conversation.workspace_id;

  if p_workspace_id is not null then
    with linked_source_memories as (
      select mi.id
      from public.memory_items mi
      where mi.user_id = v_user_id
        and mi.status = 'active'
        and mi.owner_type = v_source_owner_type
        and (
          (v_source_owner_type = 'global' and mi.owner_id is null)
          or (v_source_owner_type = 'workspace' and mi.owner_id = v_source_owner_id)
        )
        and exists (
          select 1
          from public.memory_item_sources mis
          where mis.memory_item_id = mi.id
            and mis.user_id = v_user_id
            and mis.conversation_id = p_conversation_id
        )
    ),
    movable_memories as (
      select lsm.id
      from linked_source_memories lsm
      where not exists (
        select 1
        from public.memory_item_sources other_sources
        where other_sources.memory_item_id = lsm.id
          and other_sources.user_id = v_user_id
          and other_sources.conversation_id is not null
          and other_sources.conversation_id <> p_conversation_id
      )
    ),
    moved_memories as (
      update public.memory_items mi
      set owner_type = 'workspace',
          owner_id = p_workspace_id
      where mi.id in (select id from movable_memories)
        and mi.user_id = v_user_id
      returning mi.id
    )
    select
      (select count(*) from moved_memories),
      (select count(*) from linked_source_memories)
        - (select count(*) from moved_memories)
    into v_moved_memory_count, v_left_memory_count;
  else
    select count(*)
    into v_left_memory_count
    from public.memory_items mi
    where mi.user_id = v_user_id
      and mi.status = 'active'
      and mi.owner_type = 'workspace'
      and mi.owner_id = v_conversation.workspace_id
      and exists (
        select 1
        from public.memory_item_sources mis
        where mis.memory_item_id = mi.id
          and mis.user_id = v_user_id
          and mis.conversation_id = p_conversation_id
      );
  end if;

  update public.conversations
  set workspace_id = p_workspace_id,
      mentor_id = null,
      updated_at = now()
  where id = p_conversation_id
    and user_id = v_user_id
  returning id, title, mentor_id, workspace_id, created_at, updated_at
  into v_updated_conversation;

  return jsonb_build_object(
    'conversation_found', true,
    'target_workspace_found', true,
    'conversation', jsonb_build_object(
      'id', v_updated_conversation.id,
      'title', v_updated_conversation.title,
      'mentor_id', v_updated_conversation.mentor_id,
      'workspace_id', v_updated_conversation.workspace_id,
      'created_at', v_updated_conversation.created_at,
      'updated_at', v_updated_conversation.updated_at
    ),
    'memory', jsonb_build_object(
      'moved', coalesce(v_moved_memory_count, 0),
      'copied', 0,
      'leftInPlace', coalesce(v_left_memory_count, 0)
    )
  );
end;
$$;

revoke all on function public.move_conversation_context(uuid, uuid, text) from public;
grant execute on function public.move_conversation_context(uuid, uuid, text) to authenticated;

alter table public.conversations
  drop constraint if exists conversations_workspace_id_fkey;

alter table public.conversations
  add constraint conversations_workspace_id_fkey
  foreign key (workspace_id)
  references public.workspaces(id)
  on delete cascade;

create or replace function public.delete_workspace_cascade(p_workspace_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_memory_ids uuid[] := array[]::uuid[];
  v_conversation_ids uuid[] := array[]::uuid[];
  v_storage_paths text[] := array[]::text[];
begin
  if v_user_id is null then
    return jsonb_build_object(
      'workspace_deleted', false,
      'conversation_count', 0,
      'memory_item_count', 0,
      'storage_paths', '[]'::jsonb
    );
  end if;

  if not exists (
    select 1
    from public.workspaces
    where id = p_workspace_id
      and user_id = v_user_id
  ) then
    return jsonb_build_object(
      'workspace_deleted', false,
      'conversation_count', 0,
      'memory_item_count', 0,
      'storage_paths', '[]'::jsonb
    );
  end if;

  select coalesce(array_agg(id), array[]::uuid[])
  into v_memory_ids
  from public.memory_items
  where user_id = v_user_id
    and owner_type = 'workspace'
    and owner_id = p_workspace_id;

  select coalesce(array_agg(id), array[]::uuid[])
  into v_conversation_ids
  from public.conversations
  where user_id = v_user_id
    and workspace_id = p_workspace_id;

  select coalesce(array_agg(distinct message_attachments.storage_path), array[]::text[])
  into v_storage_paths
  from public.message_attachments
  join public.messages
    on messages.id = message_attachments.message_id
  where message_attachments.user_id = v_user_id
    and messages.user_id = v_user_id
    and messages.conversation_id = any(v_conversation_ids);

  if cardinality(v_memory_ids) > 0 then
    delete from public.memory_item_embeddings
    where user_id = v_user_id
      and memory_item_id = any(v_memory_ids);
  end if;

  delete from public.memory_items
  where user_id = v_user_id
    and owner_type = 'workspace'
    and owner_id = p_workspace_id;

  delete from public.conversations
  where user_id = v_user_id
    and workspace_id = p_workspace_id;

  delete from public.workspaces
  where id = p_workspace_id
    and user_id = v_user_id;

  return jsonb_build_object(
    'workspace_deleted', true,
    'conversation_count', cardinality(v_conversation_ids),
    'memory_item_count', cardinality(v_memory_ids),
    'storage_paths', to_jsonb(v_storage_paths)
  );
end;
$$;

revoke all on function public.delete_workspace_cascade(uuid) from public;
grant execute on function public.delete_workspace_cascade(uuid) to authenticated;

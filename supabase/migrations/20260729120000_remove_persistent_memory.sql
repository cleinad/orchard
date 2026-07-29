-- Remove persistent memory after the application has stopped reading and
-- writing its contracts. Compatibility drops cover memory objects that may
-- exist on development targets but are absent from the canonical baseline.

begin;

delete from public.chat_run_events
where event = 'failed'
  and detail_code = 'memory_failed';

drop function if exists
  public.move_conversation_context(uuid, uuid, text)
  restrict;
drop function if exists
  public.move_conversation_context(uuid, uuid)
  restrict;
drop function if exists
  public.delete_workspace_cascade(uuid)
  restrict;

drop trigger if exists on_memory_item_latest_source
on public.memory_items;

do $$
declare
  routine record;
begin
  for routine in
    select
      case p.prokind when 'p' then 'procedure' else 'function' end as object_kind,
      n.nspname as schema_name,
      p.proname as routine_name,
      pg_get_function_identity_arguments(p.oid) as identity_arguments
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind in ('f', 'p')
      and p.proname ilike '%memory%'
    order by p.oid
  loop
    execute format(
      'drop %s if exists %I.%I(%s) restrict',
      routine.object_kind,
      routine.schema_name,
      routine.routine_name,
      routine.identity_arguments
    );
  end loop;
end;
$$;

drop view if exists public.memory_planner_daily_metrics restrict;

drop table if exists public.memory_operation_items restrict;
drop table if exists public.memory_planner_runs restrict;
drop table if exists public.memory_item_embeddings restrict;
drop table if exists public.memory_item_sources restrict;
drop table if exists public.memory_items restrict;
drop table if exists public.memory_operations restrict;
drop table if exists public.memory_extraction_finalizations restrict;
drop table if exists public.memory_extraction_marks restrict;
drop table if exists public.memory_extraction_runs restrict;
drop table if exists public.memory_extraction_states restrict;
drop table if exists public.memory_files restrict;

alter table public.chat_runs
  drop constraint if exists chat_runs_memory_status_check;

revoke update (
  status,
  response_status,
  title_status,
  search_status,
  memory_status,
  response_text,
  search_metadata,
  search_activity,
  title,
  title_source,
  title_version,
  error_code,
  error_message,
  updated_at,
  completed_at,
  cancelled_at
) on table public.chat_runs from authenticated;

alter table public.chat_runs
  drop column if exists memory_status;

grant select on table public.chat_runs to authenticated;
grant update (
  status,
  response_status,
  title_status,
  search_status,
  response_text,
  search_metadata,
  search_activity,
  title,
  title_source,
  title_version,
  error_code,
  error_message,
  updated_at,
  completed_at,
  cancelled_at
) on table public.chat_runs to authenticated;

alter table public.workspaces
  add constraint workspaces_id_user_id_key
  unique (id, user_id);

alter table public.conversations
  add constraint conversations_workspace_user_id_fkey
  foreign key (workspace_id, user_id)
  references public.workspaces (id, user_id)
  on delete cascade;

alter table public.conversations
  drop constraint conversations_workspace_id_fkey;

drop extension if exists vector restrict;
drop extension if exists pg_trgm restrict;

create function public.move_conversation_context(
  p_conversation_id uuid,
  p_workspace_id uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_conversation record;
  v_updated_conversation record;
begin
  if v_user_id is null then
    return jsonb_build_object('error', 'unauthorized');
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

  if p_workspace_id is not null
    and not exists (
      select 1
      from public.workspaces
      where id = p_workspace_id
        and user_id = v_user_id
    )
  then
    return jsonb_build_object(
      'conversation_found', true,
      'target_workspace_found', false
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
    )
  );
end;
$$;

revoke all
on function public.move_conversation_context(uuid, uuid)
from public, anon, authenticated, service_role;
grant execute
on function public.move_conversation_context(uuid, uuid)
to authenticated, service_role;

create function public.delete_workspace_cascade(p_workspace_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_workspace_id uuid;
  v_conversation_ids uuid[] := array[]::uuid[];
  v_storage_paths text[] := array[]::text[];
begin
  if v_user_id is null then
    return jsonb_build_object(
      'workspace_deleted', false,
      'conversation_count', 0,
      'storage_paths', '[]'::jsonb
    );
  end if;

  select id
  into v_workspace_id
  from public.workspaces
  where id = p_workspace_id
    and user_id = v_user_id
  for update;

  if not found then
    return jsonb_build_object(
      'workspace_deleted', false,
      'conversation_count', 0,
      'storage_paths', '[]'::jsonb
    );
  end if;

  select coalesce(
    array_agg(locked_conversations.id order by locked_conversations.id),
    array[]::uuid[]
  )
  into v_conversation_ids
  from (
    select id
    from public.conversations
    where user_id = v_user_id
      and workspace_id = p_workspace_id
    order by id
    for update
  ) as locked_conversations;

  lock table public.message_attachments
  in share row exclusive mode;

  select coalesce(
    array_agg(distinct message_attachments.storage_path),
    array[]::text[]
  )
  into v_storage_paths
  from public.message_attachments
  join public.messages
    on messages.id = message_attachments.message_id
  where message_attachments.user_id = v_user_id
    and messages.user_id = v_user_id
    and messages.conversation_id = any(v_conversation_ids);

  delete from public.conversations
  where user_id = v_user_id
    and workspace_id = p_workspace_id;

  delete from public.workspaces
  where id = v_workspace_id
    and user_id = v_user_id;

  return jsonb_build_object(
    'workspace_deleted', true,
    'conversation_count', cardinality(v_conversation_ids),
    'storage_paths', to_jsonb(v_storage_paths)
  );
end;
$$;

revoke all
on function public.delete_workspace_cascade(uuid)
from public, anon, authenticated, service_role;
grant execute
on function public.delete_workspace_cascade(uuid)
to authenticated, service_role;

notify pgrst, 'reload schema';

commit;

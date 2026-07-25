-- Make the durable assistant response and terminal run snapshot one transaction.
drop function if exists public.commit_persistent_chat_run_response(uuid, text, jsonb, uuid, uuid);

create or replace function public.commit_persistent_chat_run_response(
  p_run_id uuid,
  p_content text,
  p_message_search_metadata jsonb,
  p_run_search_status text,
  p_run_search_metadata jsonb,
  p_search_activity jsonb,
  p_thread_id uuid,
  p_parent_message_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_run public.chat_runs%rowtype;
  v_message record;
  v_target_kind text;
  v_thread_id uuid;
  v_parent_message_id uuid;
  v_expected_predecessor_id uuid;
  v_previous_message_id uuid;
begin
  select * into v_run
  from public.chat_runs
  where id = p_run_id and user_id = v_user_id
  for update;
  if not found then
    return jsonb_build_object('disposition', 'not_found');
  end if;
  if v_run.status = 'cancelled' then
    return jsonb_build_object('disposition', 'cancelled');
  end if;
  if v_run.status not in ('streaming', 'finalizing') then
    return jsonb_build_object('disposition', 'invalid_state', 'status', v_run.status);
  end if;

  v_target_kind := v_run.target ->> 'kind';
  begin
    v_thread_id := nullif(v_run.target ->> 'threadId', '')::uuid;
    v_parent_message_id := nullif(v_run.target ->> 'sourceMessageId', '')::uuid;
    v_expected_predecessor_id :=
      nullif(v_run.target ->> 'expectedPredecessorId', '')::uuid;
  exception
    when invalid_text_representation then
      return jsonb_build_object('disposition', 'invalid_target');
  end;

  if v_target_kind = 'thread' then
    if v_thread_id is null
      or v_parent_message_id is null
      or v_thread_id is distinct from p_thread_id
      or v_parent_message_id is distinct from p_parent_message_id
      or not exists (
        select 1
        from public.threads thread
        join public.messages source_message
          on source_message.id = thread.source_message_id
        where thread.id = v_thread_id
          and thread.conversation_id = v_run.conversation_id
          and thread.user_id = v_user_id
          and thread.source_message_id = v_parent_message_id
          and source_message.conversation_id = v_run.conversation_id
          and source_message.user_id = v_user_id
          and source_message.thread_id is null
      )
    then
      return jsonb_build_object('disposition', 'invalid_target');
    end if;
  elsif v_target_kind in ('main', 'branch') then
    if v_thread_id is not null
      or p_thread_id is not null
      or p_parent_message_id is not null
    then
      return jsonb_build_object('disposition', 'invalid_target');
    end if;
  else
    return jsonb_build_object('disposition', 'invalid_target');
  end if;

  v_previous_message_id := case
    when v_thread_id is null then v_run.user_message_id
    else null
  end;
  if not exists (
    select 1
    from public.messages user_message
    where user_message.id = v_run.user_message_id
      and user_message.conversation_id = v_run.conversation_id
      and user_message.user_id = v_user_id
      and user_message.thread_id is not distinct from v_thread_id
      and user_message.parent_message_id is not distinct from v_parent_message_id
      and user_message.previous_message_id is not distinct from
        case when v_thread_id is null then v_expected_predecessor_id else null end
  ) then
    return jsonb_build_object('disposition', 'invalid_target');
  end if;

  insert into public.messages (
    id,
    conversation_id,
    user_id,
    role,
    content,
    search_metadata,
    thread_id,
    parent_message_id,
    previous_message_id
  ) values (
    v_run.assistant_message_id,
    v_run.conversation_id,
    v_user_id,
    'assistant',
    p_content,
    p_message_search_metadata,
    v_thread_id,
    v_parent_message_id,
    v_previous_message_id
  )
  on conflict (id) do nothing;

  select
    id,
    conversation_id,
    user_id,
    role,
    content,
    search_metadata,
    thread_id,
    parent_message_id,
    previous_message_id
  into v_message
  from public.messages where id = v_run.assistant_message_id;
  if not found
    or v_message.conversation_id <> v_run.conversation_id
    or v_message.user_id <> v_user_id
    or v_message.role <> 'assistant'
    or v_message.content <> p_content
    or v_message.search_metadata is distinct from p_message_search_metadata
    or v_message.thread_id is distinct from v_thread_id
    or v_message.parent_message_id is distinct from v_parent_message_id
    or v_message.previous_message_id is distinct from v_previous_message_id
  then
    return jsonb_build_object('disposition', 'message_conflict');
  end if;

  update public.chat_runs
  set status = 'completed',
      response_status = 'completed',
      response_text = p_content,
      search_status = p_run_search_status,
      search_metadata = p_run_search_metadata,
      search_activity = p_search_activity,
      error_code = null,
      error_message = null,
      completed_at = now(),
      updated_at = now()
  where id = p_run_id;
  return jsonb_build_object(
    'disposition', 'committed',
    'assistant_message_id', v_run.assistant_message_id
  );
end;
$$;

revoke all on function public.commit_persistent_chat_run_response(uuid, text, jsonb, text, jsonb, jsonb, uuid, uuid) from public, anon, authenticated;
grant execute on function public.commit_persistent_chat_run_response(uuid, text, jsonb, text, jsonb, jsonb, uuid, uuid) to authenticated;

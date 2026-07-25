-- Reconnectable lifecycle and title provenance for persistent chats only.
-- Temporary/incognito chats remain browser-owned and never enter these tables.

alter table public.conversations
  add column if not exists title_source text not null default 'fallback',
  add column if not exists title_version integer not null default 0,
  add column if not exists title_run_id uuid;

alter table public.conversations
  drop constraint if exists conversations_title_source_check;
alter table public.conversations
  add constraint conversations_title_source_check
  check (title_source in ('fallback', 'generated', 'user'));

-- Titles that predate provenance tracking have already completed the old title
-- lifecycle. Treat them as generated so a later run cannot overwrite them.
update public.conversations
set title_source = 'generated', title_version = 1
where title_source = 'fallback' and title_version = 0;

create table if not exists public.chat_runs (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  request_hash text not null,
  scope_key text not null,
  target jsonb not null,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_message_id uuid not null,
  assistant_message_id uuid not null,
  created_thread_id uuid,
  created_branch_id uuid,
  status text not null default 'queued',
  response_status text not null default 'pending',
  title_status text not null default 'pending',
  search_status text not null default 'pending',
  memory_status text not null default 'pending',
  response_text text,
  search_metadata jsonb,
  search_activity jsonb,
  title text,
  title_source text not null default 'fallback',
  title_version integer not null default 0,
  error_code text,
  error_message text,
  accepted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  cancelled_at timestamptz
);

alter table public.chat_runs
  drop constraint if exists chat_runs_status_check,
  drop constraint if exists chat_runs_response_status_check,
  drop constraint if exists chat_runs_title_status_check,
  drop constraint if exists chat_runs_search_status_check,
  drop constraint if exists chat_runs_memory_status_check,
  drop constraint if exists chat_runs_title_source_check;
alter table public.chat_runs
  add constraint chat_runs_status_check
    check (status in ('queued', 'submitting', 'streaming', 'finalizing', 'completed', 'failed', 'cancelled', 'interrupted')),
  add constraint chat_runs_response_status_check
    check (response_status in ('pending', 'running', 'completed', 'failed', 'skipped', 'cancelled')),
  add constraint chat_runs_title_status_check
    check (title_status in ('pending', 'running', 'completed', 'failed', 'skipped', 'cancelled')),
  add constraint chat_runs_search_status_check
    check (search_status in ('pending', 'running', 'completed', 'failed', 'skipped', 'cancelled')),
  add constraint chat_runs_memory_status_check
    check (memory_status in ('pending', 'running', 'completed', 'failed', 'skipped', 'cancelled')),
  add constraint chat_runs_title_source_check
    check (title_source in ('fallback', 'generated', 'user'));

create unique index if not exists chat_runs_active_scope_idx
  on public.chat_runs(user_id, scope_key)
  where status in ('queued', 'submitting', 'streaming', 'finalizing', 'interrupted');
create index if not exists chat_runs_user_updated_idx
  on public.chat_runs(user_id, updated_at desc);

create table if not exists public.chat_run_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  run_id uuid not null references public.chat_runs(id) on delete cascade,
  event text not null,
  detail_code text,
  created_at timestamptz not null default now()
);
create index if not exists chat_run_events_run_idx
  on public.chat_run_events(user_id, run_id, created_at);

alter table public.chat_runs enable row level security;
alter table public.chat_run_events enable row level security;

drop policy if exists "Users can read own chat runs" on public.chat_runs;
create policy "Users can read own chat runs" on public.chat_runs
  for select using (auth.uid() = user_id);
drop policy if exists "Users can mutate own chat runs" on public.chat_runs;
drop policy if exists "Users can update own chat runs" on public.chat_runs;
create policy "Users can update own chat runs" on public.chat_runs
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users can read own chat run events" on public.chat_run_events;
create policy "Users can read own chat run events" on public.chat_run_events
  for select using (auth.uid() = user_id);
drop policy if exists "Users can insert own chat run events" on public.chat_run_events;
create policy "Users can insert own chat run events" on public.chat_run_events
  for insert with check (auth.uid() = user_id);

revoke all on table public.chat_runs from anon, authenticated;
grant select on table public.chat_runs to authenticated;
grant update (
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
) on table public.chat_runs to authenticated;
grant all on table public.chat_runs to service_role;

revoke all on table public.chat_run_events from anon, authenticated;
grant select, insert on table public.chat_run_events to authenticated;
grant all on table public.chat_run_events to service_role;
revoke all on sequence public.chat_run_events_id_seq from anon;
grant usage, select on sequence public.chat_run_events_id_seq to authenticated;
grant all on sequence public.chat_run_events_id_seq to service_role;

create or replace function public.accept_chat_run(
  p_run_id uuid,
  p_request_hash text,
  p_scope_key text,
  p_target jsonb,
  p_conversation_id uuid,
  p_user_message_id uuid,
  p_assistant_message_id uuid,
  p_created_thread_id uuid,
  p_created_branch_id uuid,
  p_fallback_title text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing record;
  v_active record;
  v_scope_key text;
  v_target_kind text := p_target ->> 'kind';
  v_thread_id uuid;
  v_branch_id uuid;
  v_source_message_id uuid;
  v_branch_source_message_id uuid;
  v_expected_predecessor_id uuid;
begin
  if v_user_id is null then
    return jsonb_build_object('disposition', 'unauthorized');
  end if;

  select id, request_hash, status into v_existing
  from public.chat_runs where id = p_run_id and user_id = v_user_id;
  if found then
    if v_existing.request_hash <> p_request_hash then
      return jsonb_build_object('disposition', 'payload_conflict', 'run_id', v_existing.id);
    end if;
    return jsonb_build_object(
      'disposition', 'reattach',
      'run_id', v_existing.id,
      'status', v_existing.status
    );
  end if;

  if jsonb_typeof(p_target) <> 'object'
    or v_target_kind is null
    or v_target_kind not in ('main', 'branch', 'thread')
    or p_target ->> 'chatId' is distinct from p_conversation_id::text
    or p_target ->> 'conversationId' is distinct from p_conversation_id::text
    or p_conversation_id is null
    or not exists (
      select 1 from public.conversations
      where id = p_conversation_id and user_id = v_user_id
    )
  then
    return jsonb_build_object('disposition', 'invalid_target');
  end if;

  begin
    v_thread_id := nullif(p_target ->> 'threadId', '')::uuid;
    v_branch_id := nullif(p_target ->> 'branchId', '')::uuid;
    v_source_message_id := nullif(p_target ->> 'sourceMessageId', '')::uuid;
    v_branch_source_message_id := nullif(p_target ->> 'branchSourceMessageId', '')::uuid;
    v_expected_predecessor_id := nullif(p_target ->> 'expectedPredecessorId', '')::uuid;
  exception
    when invalid_text_representation then
      return jsonb_build_object('disposition', 'invalid_target');
  end;

  if v_target_kind = 'thread' then
    if v_thread_id is null
      or v_source_message_id is null
      or v_branch_id is not null
      or v_branch_source_message_id is not null
      or p_created_branch_id is not null
      or (
        p_created_thread_id is not null
        and p_created_thread_id is distinct from v_thread_id
      )
      or not exists (
        select 1
        from public.messages source_message
        where source_message.id = v_source_message_id
          and source_message.conversation_id = p_conversation_id
          and source_message.user_id = v_user_id
          and source_message.thread_id is null
      )
      or (
        p_created_thread_id is null
        and not exists (
          select 1
          from public.threads thread
          where thread.id = v_thread_id
            and thread.conversation_id = p_conversation_id
            and thread.user_id = v_user_id
            and thread.source_message_id = v_source_message_id
        )
      )
      or (
        v_expected_predecessor_id is not null
        and not exists (
          select 1
          from public.messages predecessor
          where predecessor.id = v_expected_predecessor_id
            and predecessor.conversation_id = p_conversation_id
            and predecessor.user_id = v_user_id
            and predecessor.thread_id = v_thread_id
            and predecessor.parent_message_id = v_source_message_id
        )
      )
    then
      return jsonb_build_object('disposition', 'invalid_target');
    end if;
    v_scope_key := format('%s:thread:%s', p_conversation_id, v_thread_id);
  elsif v_target_kind = 'branch' then
    if v_thread_id is not null
      or v_branch_id is null
      or v_branch_source_message_id is null
      or v_source_message_id is not null
      or v_expected_predecessor_id is distinct from v_branch_source_message_id
      or p_created_thread_id is not null
      or p_created_branch_id is distinct from v_branch_id
      or not exists (
        select 1
        from public.messages branch_source
        where branch_source.id = v_branch_source_message_id
          and branch_source.conversation_id = p_conversation_id
          and branch_source.user_id = v_user_id
          and branch_source.thread_id is null
          and branch_source.role = 'assistant'
      )
    then
      return jsonb_build_object('disposition', 'invalid_target');
    end if;
    v_scope_key := format(
      '%s:branch:%s:%s',
      p_conversation_id,
      v_branch_source_message_id,
      coalesce(v_expected_predecessor_id::text, 'root')
    );
  else
    if v_thread_id is not null
      or v_branch_id is not null
      or v_source_message_id is not null
      or v_branch_source_message_id is not null
      or p_created_thread_id is not null
      or p_created_branch_id is not null
      or (
        v_expected_predecessor_id is not null
        and not exists (
          select 1
          from public.messages predecessor
          where predecessor.id = v_expected_predecessor_id
            and predecessor.conversation_id = p_conversation_id
            and predecessor.user_id = v_user_id
            and predecessor.thread_id is null
        )
      )
    then
      return jsonb_build_object('disposition', 'invalid_target');
    end if;
    v_scope_key := format(
      '%s:main:%s',
      p_conversation_id,
      coalesce(v_expected_predecessor_id::text, 'root')
    );
  end if;

  select id, status into v_active from public.chat_runs
  where user_id = v_user_id and scope_key = v_scope_key
    and status in ('queued', 'submitting', 'streaming', 'finalizing', 'interrupted')
  limit 1;
  if found then
    return jsonb_build_object(
      'disposition', 'active_conflict',
      'run_id', v_active.id,
      'status', v_active.status
    );
  end if;

  insert into public.chat_runs (
    id, user_id, request_hash, scope_key, target, conversation_id,
    user_message_id, assistant_message_id, created_thread_id,
    created_branch_id, title, title_source
  ) values (
    p_run_id, v_user_id, p_request_hash, v_scope_key, p_target,
    p_conversation_id, p_user_message_id, p_assistant_message_id,
    p_created_thread_id, p_created_branch_id, p_fallback_title, 'fallback'
  );

  insert into public.chat_run_events (user_id, run_id, event)
  values (v_user_id, p_run_id, 'accepted');
  return jsonb_build_object('disposition', 'accepted', 'run_id', p_run_id);
exception
  when unique_violation then
    -- An identical retry can race the original insert. Re-read after the
    -- losing statement rolls back and attach to the authoritative record.
    select id, request_hash, status into v_existing
    from public.chat_runs where id = p_run_id and user_id = v_user_id;
    if found then
      if v_existing.request_hash = p_request_hash then
        return jsonb_build_object(
          'disposition', 'reattach',
          'run_id', v_existing.id,
          'status', v_existing.status
        );
      end if;
      return jsonb_build_object('disposition', 'payload_conflict', 'run_id', v_existing.id);
    end if;

    select id, status into v_active from public.chat_runs
    where user_id = v_user_id and scope_key = v_scope_key
      and status in ('queued', 'submitting', 'streaming', 'finalizing', 'interrupted')
    limit 1;
    return jsonb_build_object(
      'disposition', 'active_conflict',
      'run_id', v_active.id,
      'status', v_active.status
    );
end;
$$;

revoke all on function public.accept_chat_run(uuid, text, text, jsonb, uuid, uuid, uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.accept_chat_run(uuid, text, text, jsonb, uuid, uuid, uuid, uuid, uuid, text) to authenticated;

create or replace function public.commit_persistent_chat_run_response(
  p_run_id uuid,
  p_content text,
  p_search_metadata jsonb,
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
    p_search_metadata,
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
    or v_message.search_metadata is distinct from p_search_metadata
    or v_message.thread_id is distinct from v_thread_id
    or v_message.parent_message_id is distinct from v_parent_message_id
    or v_message.previous_message_id is distinct from v_previous_message_id
  then
    return jsonb_build_object('disposition', 'message_conflict');
  end if;

  update public.chat_runs
  set status = 'finalizing',
      response_status = 'completed',
      response_text = p_content,
      updated_at = now()
  where id = p_run_id;
  return jsonb_build_object(
    'disposition', 'committed',
    'assistant_message_id', v_run.assistant_message_id
  );
end;
$$;

revoke all on function public.commit_persistent_chat_run_response(uuid, text, jsonb, uuid, uuid) from public, anon, authenticated;
grant execute on function public.commit_persistent_chat_run_response(uuid, text, jsonb, uuid, uuid) to authenticated;

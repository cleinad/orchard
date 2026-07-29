begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(83);

select has_table('public', 'conversations', 'production baseline contains conversations');
select has_table('public', 'chat_runs', 'chat-run migration creates persistent runs');
select has_table('public', 'chat_run_events', 'chat-run migration creates lifecycle events');
select has_column('public', 'conversations', 'title_source', 'title provenance is present');
select hasnt_table('public', 'temporary_chat_runs', 'temporary runs are never database-backed');
select ok(
  not has_table_privilege('anon', 'public.chat_runs', 'SELECT'),
  'anonymous users have no direct chat-run access'
);
select ok(
  has_table_privilege('authenticated', 'public.chat_runs', 'SELECT'),
  'authenticated users can reconcile their visible chat runs'
);
select ok(
  not has_table_privilege('authenticated', 'public.chat_runs', 'INSERT'),
  'authenticated users must accept runs through the validated RPC'
);
select ok(
  not has_table_privilege('authenticated', 'public.chat_runs', 'DELETE'),
  'authenticated users cannot delete durable run history'
);
select ok(
  has_column_privilege('authenticated', 'public.chat_runs', 'status', 'UPDATE'),
  'authenticated server requests can advance run status'
);
select ok(
  not has_column_privilege('authenticated', 'public.chat_runs', 'scope_key', 'UPDATE'),
  'authenticated users cannot rewrite the authoritative run scope'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.accept_chat_run(uuid,text,text,jsonb,uuid,uuid,uuid,uuid,uuid,text)',
    'EXECUTE'
  ),
  'anonymous users cannot accept persistent chat runs'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.accept_chat_run(uuid,text,text,jsonb,uuid,uuid,uuid,uuid,uuid,text)',
    'EXECUTE'
  ),
  'authenticated users can execute validated run acceptance'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.commit_persistent_chat_run_response(uuid,text,jsonb,text,jsonb,jsonb,uuid,uuid)',
    'EXECUTE'
  ),
  'anonymous users cannot commit persistent responses'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.commit_persistent_chat_run_response(uuid,text,jsonb,text,jsonb,jsonb,uuid,uuid)',
    'EXECUTE'
  ),
  'authenticated users can atomically commit their own responses'
);
select hasnt_column(
  'public',
  'chat_runs',
  'memory_status',
  'chat runs no longer expose a memory subsystem column'
);
select hasnt_table('public', 'memory_items', 'memory items are removed');
select hasnt_table('public', 'memory_item_sources', 'memory sources are removed');
select hasnt_table(
  'public',
  'memory_item_embeddings',
  'memory embeddings are removed'
);
select hasnt_table(
  'public',
  'memory_extraction_states',
  'memory extraction state is removed'
);
select hasnt_table(
  'public',
  'memory_extraction_runs',
  'memory extraction runs are removed'
);
select hasnt_table(
  'public',
  'memory_extraction_marks',
  'development extraction marks are removed when present'
);
select hasnt_table(
  'public',
  'memory_extraction_finalizations',
  'development extraction finalizations are removed when present'
);
select hasnt_table(
  'public',
  'memory_operations',
  'development memory operations are removed when present'
);
select hasnt_table(
  'public',
  'memory_operation_items',
  'development memory operation items are removed when present'
);
select hasnt_table(
  'public',
  'memory_planner_runs',
  'development memory planner runs are removed when present'
);
select hasnt_table(
  'public',
  'memory_files',
  'legacy memory files are removed when present'
);
select hasnt_view(
  'public',
  'memory_planner_daily_metrics',
  'development memory planner metrics are removed when present'
);
select is_empty(
  $$
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname ilike '%memory%'
  $$,
  'no public memory routine or overload remains'
);
select is_empty(
  $$
    select id
    from public.chat_run_events
    where event = 'failed'
      and detail_code = 'memory_failed'
  $$,
  'retained memory failure events are removed'
);
select is_empty(
  $$select extname from pg_extension where extname in ('vector', 'pg_trgm')$$,
  'memory-only extensions are removed'
);
select results_eq(
  $$
    select pg_get_function_identity_arguments(p.oid)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'move_conversation_context'
  $$,
  array['p_conversation_id uuid, p_workspace_id uuid'],
  'conversation moves expose only the final two-argument identity'
);
select is_empty(
  $$
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'move_conversation_context'
      and pg_get_function_identity_arguments(p.oid) like '%p_memory_policy%'
  $$,
  'the legacy three-argument move overload is absent'
);
select results_eq(
  $$
    select p.prosecdef
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('delete_workspace_cascade', 'move_conversation_context')
    order by p.proname
  $$,
  array[false, false],
  'workspace RPCs remain security invoker functions'
);
select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.conversations'::regclass
      and conname = 'conversations_workspace_user_id_fkey'
      and pg_get_constraintdef(oid) =
        'FOREIGN KEY (workspace_id, user_id) REFERENCES workspaces(id, user_id) ON DELETE CASCADE'
  )
  and exists (
    select 1
    from pg_constraint
    where conrelid = 'public.workspaces'::regclass
      and conname = 'workspaces_id_user_id_key'
      and pg_get_constraintdef(oid) = 'UNIQUE (id, user_id)'
  )
  and not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.conversations'::regclass
      and conname = 'conversations_workspace_id_fkey'
  ),
  'workspace context enforces conversation ownership before cascading'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.move_conversation_context(uuid,uuid)',
    'EXECUTE'
  ),
  'anonymous users cannot move conversations'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.move_conversation_context(uuid,uuid)',
    'EXECUTE'
  ),
  'authenticated users can move owned conversations'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.move_conversation_context(uuid,uuid)',
    'EXECUTE'
  ),
  'service role can execute conversation moves'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.delete_workspace_cascade(uuid)',
    'EXECUTE'
  ),
  'anonymous users cannot delete workspaces'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.delete_workspace_cascade(uuid)',
    'EXECUTE'
  ),
  'authenticated users can delete owned workspaces'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.delete_workspace_cascade(uuid)',
    'EXECUTE'
  ),
  'service role can execute workspace deletion'
);

insert into public.workspaces (id, user_id, name)
values
  (
    '11111111-0000-4000-8000-000000000001',
    '11111111-1111-4111-8111-111111111111',
    'Move target'
  ),
  (
    '11111111-0000-4000-8000-000000000002',
    '11111111-1111-4111-8111-111111111111',
    'Delete target'
  ),
  (
    '22222222-0000-4000-8000-000000000001',
    '22222222-2222-4222-8222-222222222222',
    'Other user workspace'
  );

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '22222222-2222-4222-8222-222222222222',
  true
);
select throws_ok(
  $$
    insert into public.conversations (
      id,
      user_id,
      title,
      workspace_id
    ) values (
      '22222222-0000-4000-8000-000000000099',
      '22222222-2222-4222-8222-222222222222',
      'Rejected cross-owner insert',
      '11111111-0000-4000-8000-000000000001'
    )
  $$,
  '23503'::char(5),
  'insert or update on table "conversations" violates foreign key constraint "conversations_workspace_user_id_fkey"',
  'a user cannot insert a conversation into another user workspace'
);
select throws_ok(
  $$
    update public.conversations
    set workspace_id = '11111111-0000-4000-8000-000000000001'
    where id = '22222222-aaaa-4222-8222-222222222222'
  $$,
  '23503'::char(5),
  'insert or update on table "conversations" violates foreign key constraint "conversations_workspace_user_id_fkey"',
  'a user cannot move a conversation into another user workspace directly'
);
reset role;

insert into public.mentors (
  id,
  user_id,
  slug,
  name,
  tagline,
  base_system_prompt
) values (
  '11111111-0000-4000-8000-000000000010',
  '11111111-1111-4111-8111-111111111111',
  'slice-five-mentor',
  'Slice Five Mentor',
  'Synthetic mentor',
  'Synthetic mentor prompt'
);

insert into public.conversations (
  id,
  user_id,
  title,
  mentor_id,
  workspace_id
) values
  (
    '11111111-0000-4000-8000-000000000020',
    '11111111-1111-4111-8111-111111111111',
    'Mentor conversation',
    '11111111-0000-4000-8000-000000000010',
    null
  ),
  (
    '11111111-0000-4000-8000-000000000021',
    '11111111-1111-4111-8111-111111111111',
    'Workspace deletion conversation',
    null,
    '11111111-0000-4000-8000-000000000002'
  ),
  (
    '22222222-0000-4000-8000-000000000020',
    '22222222-2222-4222-8222-222222222222',
    'Other user workspace conversation',
    null,
    '22222222-0000-4000-8000-000000000001'
  );

insert into public.messages (
  id,
  conversation_id,
  user_id,
  role,
  content
) values
  (
    '11111111-0000-4000-8000-000000000030',
    '11111111-aaaa-4111-8111-111111111111',
    '11111111-1111-4111-8111-111111111111',
    'assistant',
    'Move-preservation source message'
  ),
  (
    '11111111-0000-4000-8000-000000000031',
    '11111111-aaaa-4111-8111-111111111111',
    '11111111-1111-4111-8111-111111111111',
    'user',
    'Move-preservation branch message'
  ),
  (
    '11111111-0000-4000-8000-000000000032',
    '11111111-aaaa-4111-8111-111111111111',
    '11111111-1111-4111-8111-111111111111',
    'user',
    'Move-preservation thread message'
  ),
  (
    '11111111-0000-4000-8000-000000000040',
    '11111111-0000-4000-8000-000000000021',
    '11111111-1111-4111-8111-111111111111',
    'assistant',
    'Workspace deletion source message'
  ),
  (
    '11111111-0000-4000-8000-000000000041',
    '11111111-0000-4000-8000-000000000021',
    '11111111-1111-4111-8111-111111111111',
    'user',
    'Workspace deletion branch message'
  ),
  (
    '11111111-0000-4000-8000-000000000042',
    '11111111-0000-4000-8000-000000000021',
    '11111111-1111-4111-8111-111111111111',
    'user',
    'Workspace deletion thread message'
  ),
  (
    '22222222-0000-4000-8000-000000000030',
    '22222222-0000-4000-8000-000000000020',
    '22222222-2222-4222-8222-222222222222',
    'assistant',
    'Other user source message'
  ),
  (
    '22222222-0000-4000-8000-000000000031',
    '22222222-0000-4000-8000-000000000020',
    '22222222-2222-4222-8222-222222222222',
    'user',
    'Other user branch message'
  ),
  (
    '22222222-0000-4000-8000-000000000032',
    '22222222-0000-4000-8000-000000000020',
    '22222222-2222-4222-8222-222222222222',
    'user',
    'Other user thread message'
  );

insert into public.conversation_branches (
  id,
  conversation_id,
  source_message_id,
  entry_message_id,
  user_id,
  title
) values
  (
    '11111111-0000-4000-8000-000000000050',
    '11111111-aaaa-4111-8111-111111111111',
    '11111111-0000-4000-8000-000000000030',
    '11111111-0000-4000-8000-000000000031',
    '11111111-1111-4111-8111-111111111111',
    'Move-preservation branch'
  ),
  (
    '11111111-0000-4000-8000-000000000051',
    '11111111-0000-4000-8000-000000000021',
    '11111111-0000-4000-8000-000000000040',
    '11111111-0000-4000-8000-000000000041',
    '11111111-1111-4111-8111-111111111111',
    'Workspace deletion branch'
  ),
  (
    '22222222-0000-4000-8000-000000000050',
    '22222222-0000-4000-8000-000000000020',
    '22222222-0000-4000-8000-000000000030',
    '22222222-0000-4000-8000-000000000031',
    '22222222-2222-4222-8222-222222222222',
    'Other user branch'
  );

insert into public.threads (
  id,
  conversation_id,
  source_message_id,
  highlighted_text,
  user_id,
  start_offset,
  end_offset
) values
  (
    '11111111-0000-4000-8000-000000000060',
    '11111111-aaaa-4111-8111-111111111111',
    '11111111-0000-4000-8000-000000000030',
    'Move',
    '11111111-1111-4111-8111-111111111111',
    0,
    4
  ),
  (
    '11111111-0000-4000-8000-000000000061',
    '11111111-0000-4000-8000-000000000021',
    '11111111-0000-4000-8000-000000000040',
    'Workspace',
    '11111111-1111-4111-8111-111111111111',
    0,
    9
  ),
  (
    '22222222-0000-4000-8000-000000000060',
    '22222222-0000-4000-8000-000000000020',
    '22222222-0000-4000-8000-000000000030',
    'Other',
    '22222222-2222-4222-8222-222222222222',
    0,
    5
  );

update public.messages
set
  thread_id = '11111111-0000-4000-8000-000000000060',
  parent_message_id = '11111111-0000-4000-8000-000000000030'
where id = '11111111-0000-4000-8000-000000000032';

update public.messages
set
  thread_id = '11111111-0000-4000-8000-000000000061',
  parent_message_id = '11111111-0000-4000-8000-000000000040'
where id = '11111111-0000-4000-8000-000000000042';

update public.messages
set
  thread_id = '22222222-0000-4000-8000-000000000060',
  parent_message_id = '22222222-0000-4000-8000-000000000030'
where id = '22222222-0000-4000-8000-000000000032';

insert into public.message_attachments (
  id,
  message_id,
  user_id,
  storage_path,
  file_name,
  mime_type,
  size_bytes
) values
  (
    '11111111-0000-4000-8000-000000000070',
    '11111111-0000-4000-8000-000000000030',
    '11111111-1111-4111-8111-111111111111',
    '11111111-1111-4111-8111-111111111111/move.png',
    'move.png',
    'image/png',
    100
  ),
  (
    '11111111-0000-4000-8000-000000000071',
    '11111111-0000-4000-8000-000000000040',
    '11111111-1111-4111-8111-111111111111',
    '11111111-1111-4111-8111-111111111111/delete.png',
    'delete.png',
    'image/png',
    100
  ),
  (
    '22222222-0000-4000-8000-000000000070',
    '22222222-0000-4000-8000-000000000030',
    '22222222-2222-4222-8222-222222222222',
    '22222222-2222-4222-8222-222222222222/preserve.png',
    'preserve.png',
    'image/png',
    100
  );

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',
  true
);

select results_eq(
  $$
    select public.move_conversation_context(
      '11111111-aaaa-4111-8111-111111111111',
      '11111111-0000-4000-8000-000000000001'
    ) -> 'conversation' ->> 'workspace_id'
  $$,
  array['11111111-0000-4000-8000-000000000001'],
  'an owner can move a conversation to an owned workspace'
);
select results_eq(
  $$
    select concat_ws(
      '|',
      (select count(*) from public.conversation_branches where id = '11111111-0000-4000-8000-000000000050'),
      (select count(*) from public.threads where id = '11111111-0000-4000-8000-000000000060'),
      (select count(*) from public.messages where id in (
        '11111111-0000-4000-8000-000000000030',
        '11111111-0000-4000-8000-000000000031',
        '11111111-0000-4000-8000-000000000032'
      )),
      (select count(*) from public.message_attachments where id = '11111111-0000-4000-8000-000000000070')
    )
  $$,
  array['1|1|3|1'],
  'moving a conversation preserves its branches, threads, messages, and attachments'
);
select results_eq(
  $$
    select public.move_conversation_context(
      '11111111-aaaa-4111-8111-111111111111',
      '11111111-0000-4000-8000-000000000001'
    ) ->> 'error'
  $$,
  array['noop'],
  'moving a conversation to its current workspace is a no-op'
);
select results_eq(
  $$
    select public.move_conversation_context(
      '11111111-0000-4000-8000-000000000020',
      '11111111-0000-4000-8000-000000000001'
    ) ->> 'error'
  $$,
  array['mentor_context_unsupported'],
  'mentor conversations remain ineligible for workspace moves'
);
select results_eq(
  $$
    select public.move_conversation_context(
      '22222222-aaaa-4222-8222-222222222222',
      '11111111-0000-4000-8000-000000000001'
    ) ->> 'conversation_found'
  $$,
  array['false'],
  'a user cannot move another user conversation'
);
select results_eq(
  $$
    select public.move_conversation_context(
      '11111111-aaaa-4111-8111-111111111111',
      '22222222-0000-4000-8000-000000000001'
    ) ->> 'target_workspace_found'
  $$,
  array['false'],
  'a user cannot target another user workspace'
);
select results_eq(
  $$
    select workspace_id::text
    from public.conversations
    where id = '11111111-aaaa-4111-8111-111111111111'
  $$,
  array['11111111-0000-4000-8000-000000000001'],
  'a rejected cross-user target leaves the conversation unchanged'
);
select results_eq(
  $$
    select public.delete_workspace_cascade(
      '22222222-0000-4000-8000-000000000001'
    ) ->> 'workspace_deleted'
  $$,
  array['false'],
  'a user cannot delete another user workspace'
);

reset role;
select results_eq(
  $$
    select concat_ws(
      '|',
      (select count(*) from public.conversations where id = '22222222-aaaa-4222-8222-222222222222'),
      coalesce(
        (
          select workspace_id::text
          from public.conversations
          where id = '22222222-aaaa-4222-8222-222222222222'
        ),
        'null'
      ),
      coalesce(
        (
          select mentor_id::text
          from public.conversations
          where id = '22222222-aaaa-4222-8222-222222222222'
        ),
        'null'
      )
    )
  $$,
  array['1|null|null'],
  'a rejected cross-user move leaves the other user conversation unchanged'
);
select results_eq(
  $$
    select concat_ws(
      '|',
      (select count(*) from public.workspaces where id = '22222222-0000-4000-8000-000000000001'),
      (select count(*) from public.conversations where id = '22222222-0000-4000-8000-000000000020'),
      (select count(*) from public.conversation_branches where id = '22222222-0000-4000-8000-000000000050'),
      (select count(*) from public.threads where id = '22222222-0000-4000-8000-000000000060'),
      (select count(*) from public.messages where id in (
        '22222222-0000-4000-8000-000000000030',
        '22222222-0000-4000-8000-000000000031',
        '22222222-0000-4000-8000-000000000032'
      )),
      (select count(*) from public.message_attachments where id = '22222222-0000-4000-8000-000000000070'),
      (
        select workspace_id::text
        from public.conversations
        where id = '22222222-0000-4000-8000-000000000020'
      )
    )
  $$,
  array['1|1|1|1|3|1|22222222-0000-4000-8000-000000000001'],
  'rejected cross-user deletion preserves the other user chat hierarchy'
);
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',
  true
);

select results_eq(
  $$
    select concat_ws(
      '|',
      result ->> 'workspace_deleted',
      result ->> 'conversation_count',
      result -> 'storage_paths' ->> 0
    )
    from (
      select public.delete_workspace_cascade(
        '11111111-0000-4000-8000-000000000002'
      ) as result
    ) deletion
  $$,
  array[
    'true|1|11111111-1111-4111-8111-111111111111/delete.png'
  ],
  'an owner can delete a workspace and receives conversation and Storage details'
);
select results_eq(
  $$
    select concat_ws(
      '|',
      (select count(*) from public.workspaces where id = '11111111-0000-4000-8000-000000000002'),
      (select count(*) from public.conversations where id = '11111111-0000-4000-8000-000000000021'),
      (select count(*) from public.conversation_branches where id = '11111111-0000-4000-8000-000000000051'),
      (select count(*) from public.threads where id = '11111111-0000-4000-8000-000000000061'),
      (select count(*) from public.messages where id in (
        '11111111-0000-4000-8000-000000000040',
        '11111111-0000-4000-8000-000000000041',
        '11111111-0000-4000-8000-000000000042'
      )),
      (select count(*) from public.message_attachments where id = '11111111-0000-4000-8000-000000000071')
    )
  $$,
  array['0|0|0|0|0|0'],
  'workspace deletion removes its dependent chat data'
);

select results_eq(
  $$
    select id::text
    from public.conversations
    where id in (
      '11111111-aaaa-4111-8111-111111111111',
      '22222222-aaaa-4222-8222-222222222222'
    )
    order by id
  $$,
  array['11111111-aaaa-4111-8111-111111111111'],
  'RLS exposes only the current user conversation'
);
select is_empty(
  $$select id from public.conversations where id = '22222222-aaaa-4222-8222-222222222222'$$,
  'RLS hides the other synthetic user conversation'
);

select results_eq(
  $$
    select public.accept_chat_run(
      'aaaaaaaa-0000-4000-8000-000000000001',
      'request-hash-one',
      'caller-controlled-scope',
      '{"kind":"main","chatId":"11111111-aaaa-4111-8111-111111111111","conversationId":"11111111-aaaa-4111-8111-111111111111","threadId":null,"branchId":null,"branchSourceMessageId":null,"sourceMessageId":null,"expectedPredecessorId":null}'::jsonb,
      '11111111-aaaa-4111-8111-111111111111',
      '11111111-bbbb-4111-8111-111111111111',
      'aaaaaaaa-0000-4000-8000-000000000002',
      null,
      null,
      'Synthetic fallback'
    ) ->> 'disposition'
  $$,
  array['accepted'],
  'first run submission is accepted'
);
select results_eq(
  $$
    select public.accept_chat_run(
      'aaaaaaaa-0000-4000-8000-000000000001',
      'request-hash-one',
      'another-caller-controlled-scope',
      '{"kind":"main","chatId":"11111111-aaaa-4111-8111-111111111111","conversationId":"11111111-aaaa-4111-8111-111111111111","threadId":null,"branchId":null,"branchSourceMessageId":null,"sourceMessageId":null,"expectedPredecessorId":null}'::jsonb,
      '11111111-aaaa-4111-8111-111111111111',
      '11111111-bbbb-4111-8111-111111111111',
      'aaaaaaaa-0000-4000-8000-000000000002',
      null,
      null,
      'Synthetic fallback'
    ) ->> 'disposition'
  $$,
  array['reattach'],
  'an identical runId retry reattaches'
);
select results_eq(
  $$select scope_key from public.chat_runs where id = 'aaaaaaaa-0000-4000-8000-000000000001'$$,
  array['11111111-aaaa-4111-8111-111111111111:main:root'],
  'acceptance derives the active scope from the validated target'
);
select results_eq(
  $$
    select public.accept_chat_run(
      'aaaaaaaa-0000-4000-8000-000000000001',
      'different-request-hash',
      'conversation:11111111-aaaa-4111-8111-111111111111:main',
      '{}'::jsonb,
      '11111111-aaaa-4111-8111-111111111111',
      '11111111-bbbb-4111-8111-111111111111',
      'aaaaaaaa-0000-4000-8000-000000000002',
      null,
      null,
      'Synthetic fallback'
    ) ->> 'disposition'
  $$,
  array['payload_conflict'],
  'a reused runId with another payload is rejected'
);
select results_eq(
  $$
    select public.accept_chat_run(
      'aaaaaaaa-0000-4000-8000-000000000003',
      'request-hash-two',
      'different-caller-controlled-scope',
      '{"kind":"main","chatId":"11111111-aaaa-4111-8111-111111111111","conversationId":"11111111-aaaa-4111-8111-111111111111","threadId":null,"branchId":null,"branchSourceMessageId":null,"sourceMessageId":null,"expectedPredecessorId":null}'::jsonb,
      '11111111-aaaa-4111-8111-111111111111',
      '11111111-bbbb-4111-8111-111111111111',
      'aaaaaaaa-0000-4000-8000-000000000004',
      null,
      null,
      'Synthetic fallback'
    ) ->> 'disposition'
  $$,
  array['active_conflict'],
  'the database enforces one active run per path tail'
);
select results_eq(
  $$
    select public.accept_chat_run(
      'aaaaaaaa-0000-4000-8000-000000000005',
      'request-hash-missing-kind',
      'another-caller-controlled-scope',
      '{"chatId":"11111111-aaaa-4111-8111-111111111111","conversationId":"11111111-aaaa-4111-8111-111111111111","threadId":null,"branchId":null,"branchSourceMessageId":null,"sourceMessageId":null,"expectedPredecessorId":null}'::jsonb,
      '11111111-aaaa-4111-8111-111111111111',
      '11111111-bbbb-4111-8111-111111111111',
      'aaaaaaaa-0000-4000-8000-000000000006',
      null,
      null,
      'Synthetic fallback'
    ) ->> 'disposition'
  $$,
  array['invalid_target'],
  'acceptance rejects a target without an explicit kind'
);

select results_eq(
  $$select count(*)::integer from public.chat_run_events where run_id = 'aaaaaaaa-0000-4000-8000-000000000001'$$,
  array[1],
  'acceptance creates one lifecycle event despite retry'
);
select lives_ok(
  $$update public.chat_runs set status = 'streaming', response_status = 'running' where id = 'aaaaaaaa-0000-4000-8000-000000000001'$$,
  'the owner can advance the accepted run'
);
select results_eq(
  $$
    select public.commit_persistent_chat_run_response(
      'aaaaaaaa-0000-4000-8000-000000000001',
      'Synthetic committed assistant response.',
      null,
      'skipped',
      '{"mode":"off","status":"not_attempted"}'::jsonb,
      null,
      null,
      null
    ) ->> 'disposition'
  $$,
  array['committed'],
  'assistant persistence commits atomically'
);
select results_eq(
  $$select content from public.messages where id = 'aaaaaaaa-0000-4000-8000-000000000002'$$,
  array['Synthetic committed assistant response.'],
  'the committed assistant message targets the intended conversation path'
);
select results_eq(
  $$select concat_ws('|', status, response_status, search_status) from public.chat_runs where id = 'aaaaaaaa-0000-4000-8000-000000000001'$$,
  array['completed|completed|skipped'],
  'assistant persistence atomically terminalizes the durable run'
);
select ok(
  (select completed_at is not null from public.chat_runs where id = 'aaaaaaaa-0000-4000-8000-000000000001'),
  'atomic response completion records its terminal timestamp'
);
select results_eq(
  $$select search_metadata ->> 'status' from public.chat_runs where id = 'aaaaaaaa-0000-4000-8000-000000000001'$$,
  array['not_attempted'],
  'atomic response completion persists the authoritative search snapshot'
);

select results_eq(
  $$
    select public.accept_chat_run(
      'aaaaaaaa-bbbb-4000-8000-000000000003',
      'request-hash-branch',
      'caller-controlled-branch-scope',
      '{"kind":"branch","chatId":"11111111-aaaa-4111-8111-111111111111","conversationId":"11111111-aaaa-4111-8111-111111111111","threadId":null,"branchId":"aaaaaaaa-bbbb-4000-8000-000000000002","branchSourceMessageId":"aaaaaaaa-0000-4000-8000-000000000002","sourceMessageId":null,"expectedPredecessorId":"aaaaaaaa-0000-4000-8000-000000000002"}'::jsonb,
      '11111111-aaaa-4111-8111-111111111111',
      'aaaaaaaa-bbbb-4000-8000-000000000001',
      'aaaaaaaa-bbbb-4000-8000-000000000004',
      null,
      'aaaaaaaa-bbbb-4000-8000-000000000002',
      'Synthetic branch'
    ) ->> 'disposition'
  $$,
  array['accepted'],
  'a branch run is accepted for its own path'
);
insert into public.messages (
  id, conversation_id, user_id, role, content, previous_message_id
) values (
  'aaaaaaaa-bbbb-4000-8000-000000000001',
  '11111111-aaaa-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111',
  'user',
  'Synthetic branch prompt.',
  'aaaaaaaa-0000-4000-8000-000000000002'
);
insert into public.conversation_branches (
  id, conversation_id, source_message_id, entry_message_id, user_id, title
) values (
  'aaaaaaaa-bbbb-4000-8000-000000000002',
  '11111111-aaaa-4111-8111-111111111111',
  'aaaaaaaa-0000-4000-8000-000000000002',
  'aaaaaaaa-bbbb-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  'Synthetic branch'
);
update public.chat_runs
set status = 'streaming', response_status = 'running'
where id = 'aaaaaaaa-bbbb-4000-8000-000000000003';
select results_eq(
  $$select public.commit_persistent_chat_run_response(
    'aaaaaaaa-bbbb-4000-8000-000000000003',
    'Synthetic branch response.',
    null,
    'skipped',
    null,
    null,
    null,
    null
  ) ->> 'disposition'$$,
  array['committed'],
  'a branch response commits through the stored run target'
);
select results_eq(
  $$select previous_message_id::text from public.messages where id = 'aaaaaaaa-bbbb-4000-8000-000000000004'$$,
  array['aaaaaaaa-bbbb-4000-8000-000000000001'],
  'the branch assistant remains attached to its branch predecessor'
);

select results_eq(
  $$
    select public.accept_chat_run(
      'aaaaaaaa-cccc-4000-8000-000000000003',
      'request-hash-thread',
      'caller-controlled-thread-scope',
      '{"kind":"thread","chatId":"11111111-aaaa-4111-8111-111111111111","conversationId":"11111111-aaaa-4111-8111-111111111111","threadId":"aaaaaaaa-cccc-4000-8000-000000000001","branchId":null,"branchSourceMessageId":null,"sourceMessageId":"aaaaaaaa-0000-4000-8000-000000000002","expectedPredecessorId":null}'::jsonb,
      '11111111-aaaa-4111-8111-111111111111',
      'aaaaaaaa-cccc-4000-8000-000000000002',
      'aaaaaaaa-cccc-4000-8000-000000000004',
      'aaaaaaaa-cccc-4000-8000-000000000001',
      null,
      'Synthetic thread'
    ) ->> 'disposition'
  $$,
  array['accepted'],
  'an inline-thread run is accepted for its own path'
);
insert into public.threads (
  id, conversation_id, source_message_id, highlighted_text, user_id,
  start_offset, end_offset, selection_stream_version
) values (
  'aaaaaaaa-cccc-4000-8000-000000000001',
  '11111111-aaaa-4111-8111-111111111111',
  'aaaaaaaa-0000-4000-8000-000000000002',
  'Synthetic',
  '11111111-1111-4111-8111-111111111111',
  0,
  9,
  'markdown-structure-v2'
);
insert into public.messages (
  id, conversation_id, user_id, role, content, thread_id, parent_message_id
) values (
  'aaaaaaaa-cccc-4000-8000-000000000002',
  '11111111-aaaa-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111',
  'user',
  'Synthetic inline-thread prompt.',
  'aaaaaaaa-cccc-4000-8000-000000000001',
  'aaaaaaaa-0000-4000-8000-000000000002'
);
update public.chat_runs
set status = 'streaming', response_status = 'running'
where id = 'aaaaaaaa-cccc-4000-8000-000000000003';
select results_eq(
  $$select public.commit_persistent_chat_run_response(
    'aaaaaaaa-cccc-4000-8000-000000000003',
    'This must not be committed.',
    null,
    'skipped',
    null,
    null,
    'aaaaaaaa-cccc-4000-8000-000000000001',
    '22222222-bbbb-4222-8222-222222222222'
  ) ->> 'disposition'$$,
  array['invalid_target'],
  'atomic completion rejects a caller-supplied parent outside the stored target'
);
select is_empty(
  $$select id from public.messages where id = 'aaaaaaaa-cccc-4000-8000-000000000004'$$,
  'a rejected parent cannot insert the assistant message'
);
select results_eq(
  $$select public.commit_persistent_chat_run_response(
    'aaaaaaaa-cccc-4000-8000-000000000003',
    'Synthetic inline-thread response.',
    null,
    'skipped',
    null,
    null,
    'aaaaaaaa-cccc-4000-8000-000000000001',
    'aaaaaaaa-0000-4000-8000-000000000002'
  ) ->> 'disposition'$$,
  array['committed'],
  'an inline-thread response commits through the stored run target'
);
select results_eq(
  $$select concat_ws('|', thread_id::text, parent_message_id::text) from public.messages where id = 'aaaaaaaa-cccc-4000-8000-000000000004'$$,
  array['aaaaaaaa-cccc-4000-8000-000000000001|aaaaaaaa-0000-4000-8000-000000000002'],
  'the inline-thread assistant remains attached to the intended thread and source message'
);

select results_eq(
  $$
    select public.accept_chat_run(
      'aaaaaaaa-dddd-4000-8000-000000000001',
      'request-hash-cancel',
      'caller-controlled-cancel-scope',
      '{"kind":"main","chatId":"11111111-aaaa-4111-8111-111111111111","conversationId":"11111111-aaaa-4111-8111-111111111111","threadId":null,"branchId":null,"branchSourceMessageId":null,"sourceMessageId":null,"expectedPredecessorId":"aaaaaaaa-0000-4000-8000-000000000002"}'::jsonb,
      '11111111-aaaa-4111-8111-111111111111',
      '11111111-bbbb-4111-8111-111111111111',
      'aaaaaaaa-dddd-4000-8000-000000000002',
      null,
      null,
      'Synthetic cancelled run'
    ) ->> 'disposition'
  $$,
  array['accepted'],
  'a cancellable run is accepted'
);
update public.chat_runs
set status = 'cancelled', response_status = 'cancelled', cancelled_at = now()
where id = 'aaaaaaaa-dddd-4000-8000-000000000001';
select results_eq(
  $$select public.commit_persistent_chat_run_response(
    'aaaaaaaa-dddd-4000-8000-000000000001',
    'This must not be committed.',
    null,
    'skipped',
    null,
    null,
    null,
    null
  ) ->> 'disposition'$$,
  array['cancelled'],
  'an explicit cancellation prevents a late response commit'
);
select is_empty(
  $$select id from public.messages where id = 'aaaaaaaa-dddd-4000-8000-000000000002'$$,
  'a cancelled run cannot insert its assistant message'
);

select set_config(
  'request.jwt.claim.sub',
  '22222222-2222-4222-8222-222222222222',
  true
);
select is_empty(
  $$select id from public.chat_runs where id = 'aaaaaaaa-0000-4000-8000-000000000001'$$,
  'run RLS hides another user run'
);
select is_empty(
  $$update public.conversations set title = 'Cross-user overwrite' where id = '11111111-aaaa-4111-8111-111111111111' returning id$$,
  'RLS prevents a cross-user title overwrite'
);

select * from finish();
rollback;

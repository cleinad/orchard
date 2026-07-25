begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(43);

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

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',
  true
);

select results_eq(
  $$select id::text from public.conversations order by id$$,
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

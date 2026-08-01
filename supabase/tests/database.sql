begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(149);

select has_table('public', 'conversations', 'production baseline contains conversations');
select has_table('public', 'chat_runs', 'chat-run migration creates persistent runs');
select has_table('public', 'chat_run_events', 'chat-run migration creates lifecycle events');
select has_column('public', 'conversations', 'title_source', 'title provenance is present');
select has_column(
  'public',
  'profiles',
  'global_instructions',
  'profiles store global instructions'
);
select col_not_null(
  'public',
  'profiles',
  'global_instructions',
  'global instructions are never null'
);
select col_default_is(
  'public',
  'profiles',
  'global_instructions',
  '',
  'global instructions default to an empty string'
);
select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_global_instructions_length_check'
      and pg_get_constraintdef(oid) ilike '%char_length(global_instructions) <= 4000%'
  ),
  'global instructions enforce the 4,000-character limit'
);
select hasnt_table('public', 'temporary_chat_runs', 'temporary runs are never database-backed');
select hasnt_table('public', 'billing_customers', 'billing customers are removed');
select hasnt_table('public', 'billing_entitlements', 'billing entitlements are removed');
select hasnt_table('public', 'billing_subscriptions', 'billing subscriptions are removed');
select hasnt_table('public', 'billing_webhook_events', 'billing webhook events are removed');
select hasnt_table('public', 'chat_usage_events', 'legacy chat usage events are removed');
select hasnt_table('public', 'usage_counters', 'legacy usage counters are removed');
select is_empty(
  $$
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'consume_chat_usage_limits',
        'consume_model_usage',
        'handle_billing_updated_at',
        'upsert_billing_subscription_if_newer'
      )
  $$,
  'no orphaned billing or quota routine remains'
);
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

select ok(
  exists (
    select 1
    from pg_proc
    where oid = 'public.handle_new_user()'::regprocedure
      and prosecdef
      and coalesce(proconfig @> array['search_path=""'], false)
  ),
  'profile provisioning uses a locked security-definer function'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.handle_new_user()',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.handle_new_user()',
    'EXECUTE'
  ),
  'API roles cannot execute the profile trigger function directly'
);
select ok(
  exists (
    select 1
    from pg_trigger as trigger
    join pg_proc as function on function.oid = trigger.tgfoid
    where trigger.tgrelid = 'auth.users'::regclass
      and trigger.tgname = 'on_auth_user_created'
      and not trigger.tgisinternal
      and trigger.tgenabled = 'O'
      and function.oid = 'public.handle_new_user()'::regprocedure
      and pg_get_triggerdef(trigger.oid) ilike '%after insert%'
  ),
  'Auth user inserts invoke the enabled profile-provisioning trigger'
);

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  recovery_token,
  email_change,
  email_change_token_new
)
values (
  '00000000-0000-0000-0000-000000000000',
  '55555555-5555-4555-8555-555555555555',
  'authenticated',
  'authenticated',
  'profile-trigger@example.test',
  '',
  '2026-07-30 12:00:00+00',
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"Profile Trigger Test"}',
  '2026-07-30 12:00:00+00',
  '2026-07-30 12:00:00+00',
  '',
  '',
  '',
  ''
);

select results_eq(
  $$
    select concat_ws(
      '|',
      email,
      full_name,
      created_at::text,
      global_instructions
    )
    from public.profiles
    where id = '55555555-5555-4555-8555-555555555555'
  $$,
  array['profile-trigger@example.test|Profile Trigger Test|2026-07-30 12:00:00+00|'],
  'a new Auth user receives a populated profile in the same transaction'
);
select is_empty(
  $$
    select users.id
    from auth.users as users
    left join public.profiles as profiles on profiles.id = users.id
    where profiles.id is null
  $$,
  'every Auth user has a matching profile'
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

reset role;

select has_table('public', 'model_usage_calls', 'telemetry migration creates provider-call accounting');
select results_eq(
  $$select relrowsecurity from pg_class where oid = 'public.model_usage_calls'::regclass$$,
  array[true],
  'telemetry rows have RLS enabled'
);
select is_empty(
  $$select policyname from pg_policies where schemaname = 'public' and tablename = 'model_usage_calls'$$,
  'telemetry rows have no browser-facing RLS policy'
);
select ok(
  not has_table_privilege('anon', 'public.model_usage_calls', 'SELECT'),
  'anonymous users cannot read telemetry'
);
select ok(
  not has_table_privilege('anon', 'public.model_usage_calls', 'INSERT'),
  'anonymous users cannot forge telemetry'
);
select ok(
  not has_table_privilege('anon', 'public.model_usage_calls', 'UPDATE'),
  'anonymous users cannot rewrite telemetry'
);
select ok(
  not has_table_privilege('anon', 'public.model_usage_calls', 'DELETE'),
  'anonymous users cannot delete telemetry'
);
select ok(
  not has_table_privilege('authenticated', 'public.model_usage_calls', 'SELECT'),
  'authenticated users cannot read telemetry'
);
select ok(
  not has_table_privilege('authenticated', 'public.model_usage_calls', 'INSERT'),
  'authenticated users cannot forge telemetry'
);
select ok(
  not has_table_privilege('authenticated', 'public.model_usage_calls', 'UPDATE'),
  'authenticated users cannot rewrite telemetry'
);
select ok(
  not has_table_privilege('authenticated', 'public.model_usage_calls', 'DELETE'),
  'authenticated users cannot delete telemetry'
);
select ok(
  has_table_privilege('service_role', 'public.model_usage_calls', 'INSERT'),
  'service role can insert telemetry'
);
select ok(
  has_table_privilege('service_role', 'public.model_usage_calls', 'SELECT'),
  'service role can read telemetry for aggregation'
);
select ok(
  not has_table_privilege('service_role', 'public.model_usage_calls', 'UPDATE'),
  'service role cannot rewrite telemetry'
);
select ok(
  not has_table_privilege('service_role', 'public.model_usage_calls', 'DELETE'),
  'service role cannot delete telemetry'
);
select ok(
  not has_table_privilege('service_role', 'public.model_usage_calls', 'TRUNCATE'),
  'service role cannot truncate telemetry'
);
select ok(
  not has_table_privilege('service_role', 'public.model_usage_calls', 'REFERENCES'),
  'service role cannot create references to telemetry'
);
select ok(
  not has_table_privilege('service_role', 'public.model_usage_calls', 'TRIGGER'),
  'service role cannot create telemetry triggers'
);

select ok(
  not has_function_privilege('authenticated', 'public.admin_model_usage_overview(timestamptz,timestamptz)', 'EXECUTE'),
  'authenticated users cannot execute the overview aggregate'
);
select ok(
  not has_function_privilege('authenticated', 'public.admin_model_usage_daily(timestamptz,timestamptz)', 'EXECUTE'),
  'authenticated users cannot execute the daily aggregate'
);
select ok(
  not has_function_privilege('authenticated', 'public.admin_model_usage_models(timestamptz,timestamptz)', 'EXECUTE'),
  'authenticated users cannot execute the model aggregate'
);
select ok(
  not has_function_privilege('authenticated', 'public.admin_model_usage_users(timestamptz,timestamptz,text,text,integer,integer)', 'EXECUTE'),
  'authenticated users cannot execute the user aggregate'
);
select ok(
  not has_function_privilege('anon', 'public.admin_model_usage_overview(timestamptz,timestamptz)', 'EXECUTE'),
  'anonymous users cannot execute the overview aggregate'
);
select ok(
  not has_function_privilege('anon', 'public.admin_model_usage_daily(timestamptz,timestamptz)', 'EXECUTE'),
  'anonymous users cannot execute the daily aggregate'
);
select ok(
  not has_function_privilege('anon', 'public.admin_model_usage_models(timestamptz,timestamptz)', 'EXECUTE'),
  'anonymous users cannot execute the model aggregate'
);
select ok(
  not has_function_privilege('anon', 'public.admin_model_usage_users(timestamptz,timestamptz,text,text,integer,integer)', 'EXECUTE'),
  'anonymous users cannot execute the user aggregate'
);
select ok(
  has_function_privilege('service_role', 'public.admin_model_usage_overview(timestamptz,timestamptz)', 'EXECUTE'),
  'service role can execute the overview aggregate'
);
select ok(
  has_function_privilege('service_role', 'public.admin_model_usage_daily(timestamptz,timestamptz)', 'EXECUTE'),
  'service role can execute the daily aggregate'
);
select ok(
  has_function_privilege('service_role', 'public.admin_model_usage_models(timestamptz,timestamptz)', 'EXECUTE'),
  'service role can execute the model aggregate'
);
select ok(
  has_function_privilege('service_role', 'public.admin_model_usage_users(timestamptz,timestamptz,text,text,integer,integer)', 'EXECUTE'),
  'service role can execute the user aggregate'
);

set local role anon;
select throws_ok(
  $$select count(*) from public.model_usage_calls$$,
  '42501'::char(5),
  'permission denied for table model_usage_calls',
  'anonymous execution cannot read telemetry'
);
reset role;

set local role authenticated;
select throws_ok(
  $$
    insert into public.model_usage_calls (
      id, user_id, request_id, call_kind, attempt, chat_mode, surface,
      provider, provider_model_id, status, duration_ms, cost_status,
      started_at, completed_at
    ) values (
      'cccccccc-0000-4000-8000-000000000003',
      '11111111-1111-4111-8111-111111111111',
      'cccccccc-1111-4000-8000-000000000003',
      'search_decision', 0, 'persistent', 'main',
      'openai', 'gpt-5.5', 'completed', 1, 'missing_usage', now(), now()
    )
  $$,
  '42501'::char(5),
  'permission denied for table model_usage_calls',
  'authenticated execution cannot forge telemetry'
);
select throws_ok(
  $$select * from public.admin_model_usage_overview(now() - interval '1 hour', now())$$,
  '42501'::char(5),
  'permission denied for function admin_model_usage_overview',
  'authenticated execution cannot run telemetry aggregates'
);
reset role;

set local role service_role;
insert into public.model_usage_calls (
  id, user_id, request_id, call_kind, attempt, chat_mode, surface,
  provider, provider_model_id, status, duration_ms, cost_status,
  started_at, completed_at
) values (
  'cccccccc-0000-4000-8000-000000000004',
  '11111111-1111-4111-8111-111111111111',
  'cccccccc-1111-4000-8000-000000000004',
  'search_decision', 0, 'persistent', 'main',
  'openai', 'gpt-5.5', 'completed', 1, 'missing_usage',
  '2026-07-30 10:00:00+00', '2026-07-30 10:00:00.001+00'
);
select results_eq(
  $$select count(*) from public.model_usage_calls where id = 'cccccccc-0000-4000-8000-000000000004'$$,
  array[1::bigint],
  'service-role execution can insert and read telemetry'
);
select results_eq(
  $$
    select provider_calls
    from public.admin_model_usage_overview(
      '2026-07-30 00:00:00+00', '2026-07-31 00:00:00+00'
    )
  $$,
  array[1::bigint],
  'service-role execution can run telemetry aggregates'
);
reset role;

insert into public.model_usage_calls (
  id, user_id, request_id, call_kind, attempt, chat_mode, surface,
  provider, provider_model_id, status, input_tokens, total_tokens,
  duration_ms, cost_status, started_at, completed_at
) values (
  'cccccccc-0000-4000-8000-000000000005',
  '11111111-1111-4111-8111-111111111111',
  'cccccccc-1111-4000-8000-000000000005',
  'search_decision', 0, 'persistent', 'main',
  'openai', 'partial-usage-fixture', 'completed', 10, 10,
  1, 'missing_usage',
  '2026-07-29 10:00:00+00', '2026-07-29 10:00:00.001+00'
);
select results_eq(
  $$
    select concat_ws(
      '|', completed_calls, usage_reported_calls, billable_usage_calls,
      missing_usage_calls
    )
    from public.admin_model_usage_overview(
      '2026-07-29 00:00:00+00', '2026-07-30 00:00:00+00'
    )
  $$,
  array['1|0|0|1'],
  'partial input-only usage remains outside the billable coverage numerator'
);
select results_eq(
  $$
    select concat_ws(
      '|', completed_calls, usage_reported_calls, billable_usage_calls
    )
    from public.admin_model_usage_users(
      '2026-07-29 00:00:00+00', '2026-07-30 00:00:00+00',
      'estimated_cost', 'desc', 100, 0
    )
    where user_id = '11111111-1111-4111-8111-111111111111'
  $$,
  array['1|0|0'],
  'per-user coverage excludes partial input-only usage from billable calls'
);

select throws_ok(
  $$
    insert into public.model_usage_calls (
      id, user_id, request_id, call_kind, attempt, chat_mode, surface,
      provider, provider_model_id, status, duration_ms, cost_status,
      started_at, completed_at
    ) values (
      'cccccccc-0000-4000-8000-000000000001',
      '11111111-1111-4111-8111-111111111111',
      'cccccccc-1111-4000-8000-000000000001',
      'prompt_preview', 0, 'persistent', 'main',
      'openai', 'gpt-5.5', 'completed', 1, 'missing_usage', now(), now()
    )
  $$,
  '23514'::char(5),
  'new row for relation "model_usage_calls" violates check constraint "model_usage_calls_call_kind_check"',
  'invalid call kinds are rejected'
);
select throws_ok(
  $$
    insert into public.model_usage_calls (
      id, user_id, request_id, call_kind, attempt, chat_mode, surface,
      provider, provider_model_id, status, input_tokens, duration_ms,
      cost_status, started_at, completed_at
    ) values (
      'cccccccc-0000-4000-8000-000000000002',
      '11111111-1111-4111-8111-111111111111',
      'cccccccc-1111-4000-8000-000000000002',
      'chat_response', 0, 'persistent', 'main',
      'openai', 'gpt-5.5', 'completed', -1, 1,
      'missing_usage', now(), now()
    )
  $$,
  '23514'::char(5),
  'new row for relation "model_usage_calls" violates check constraint "model_usage_calls_token_values_check"',
  'negative token counts are rejected'
);

insert into public.model_usage_calls (
  id, user_id, request_id, run_id, call_kind, attempt, chat_mode, surface,
  requested_model_id, resolved_model_id, provider, provider_model_id,
  status, finish_reason, input_tokens, no_cache_input_tokens,
  cache_read_tokens, output_tokens, reasoning_tokens, total_tokens,
  duration_ms, estimated_cost_nanousd, pricing_version, cost_status,
  started_at, completed_at
) values
  (
    'cccccccc-0000-4000-8000-000000000010',
    '11111111-1111-4111-8111-111111111111',
    'cccccccc-1111-4000-8000-000000000010',
    'aaaaaaaa-0000-4000-8000-000000000001',
    'chat_response', 0, 'persistent', 'main', 'auto', 'gpt-5.5',
    'openai', 'gpt-5.5', 'completed', 'stop', 10, 8, 2, 5, 2, 15,
    50, 100, 'test-price-v1', 'priced',
    '2026-07-31 10:00:00+00', '2026-07-31 10:00:00.050+00'
  ),
  (
    'cccccccc-0000-4000-8000-000000000011',
    '11111111-1111-4111-8111-111111111111',
    'cccccccc-1111-4000-8000-000000000010',
    null,
    'chat_response', 0, 'persistent', 'main', 'auto', 'gpt-5.5',
    'openai', 'gpt-5.5', 'completed', 'stop', 10, 10, 0, 5, 2, 15,
    50, 100, 'test-price-v1', 'priced',
    '2026-07-31 10:00:01+00', '2026-07-31 10:00:01.050+00'
  ),
  (
    'cccccccc-0000-4000-8000-000000000012',
    '11111111-1111-4111-8111-111111111111',
    'cccccccc-1111-4000-8000-000000000010',
    null,
    'conversation_title', 0, 'persistent', 'main', null, 'gpt-5.5',
    'openai', 'gpt-5.5', 'completed', 'stop', 4, 4, 0, 2, 0, 6,
    20, 50, 'test-price-v1', 'priced',
    '2026-07-31 10:00:02+00', '2026-07-31 10:00:02.020+00'
  ),
  (
    'cccccccc-0000-4000-8000-000000000013',
    '11111111-1111-4111-8111-111111111111',
    'cccccccc-1111-4000-8000-000000000010',
    null,
    'chat_response_retry', 1, 'persistent', 'main', null, 'gpt-5.5',
    'openai', 'gpt-5.5', 'completed', 'stop', 8, 8, 0, 4, 1, 12,
    30, 75, 'test-price-v1', 'priced',
    '2026-07-31 10:00:03+00', '2026-07-31 10:00:03.030+00'
  ),
  (
    'cccccccc-0000-4000-8000-000000000014',
    '11111111-1111-4111-8111-111111111111',
    'cccccccc-1111-4000-8000-000000000014',
    null,
    'mentor_generation', 0, null, 'mentor', null, 'gpt-5.5',
    'openai', 'gpt-5.5', 'completed', 'stop', 10, 10, 0, 5, 2, 15,
    40, 100, 'test-price-v1', 'priced',
    '2026-07-31 10:00:04+00', '2026-07-31 10:00:04.040+00'
  ),
  (
    'cccccccc-0000-4000-8000-000000000015',
    '11111111-1111-4111-8111-111111111111',
    'cccccccc-1111-4000-8000-000000000010',
    null,
    'search_plan', 0, 'persistent', 'main', null, 'gpt-5.5',
    'openai', 'gpt-5.5', 'failed', 'error', 4, 4, 0, 2, 0, 6,
    20, 25, 'test-price-v1', 'priced',
    '2026-07-31 10:00:05+00', '2026-07-31 10:00:05.020+00'
  ),
  (
    'cccccccc-0000-4000-8000-000000000030',
    '11111111-1111-4111-8111-111111111111',
    'cccccccc-1111-4000-8000-000000000030',
    null,
    'chat_response', 0, 'temporary', 'main', 'gpt-5.4', 'gpt-5.4',
    'openai', 'gpt-5.4', 'completed', 'stop', 3, 3, 0, 2, 0, 5,
    15, 10, 'test-price-v1', 'priced',
    '2026-07-31 10:00:06+00', '2026-07-31 10:00:06.015+00'
  ),
  (
    'cccccccc-0000-4000-8000-000000000031',
    '11111111-1111-4111-8111-111111111111',
    'cccccccc-1111-4000-8000-000000000030',
    null,
    'search_decision', 0, 'temporary', 'main', null, null,
    'openai', 'gpt-5.4', 'completed', 'stop', 1, 1, 0, 1, 0, 2,
    5, 5, 'test-price-v1', 'priced',
    '2026-07-31 10:00:07+00', '2026-07-31 10:00:07.005+00'
  );

insert into public.model_usage_calls
select calls.*
from public.model_usage_calls
  as calls
where calls.id = 'cccccccc-0000-4000-8000-000000000010'
on conflict (id) do nothing;

select results_eq(
  $$select count(*) from public.model_usage_calls where id = 'cccccccc-0000-4000-8000-000000000010'$$,
  array[1::bigint],
  'repeating the same provider-call ID is idempotent'
);
select results_eq(
  $$
    select count(*)
    from public.model_usage_calls
    where request_id = 'cccccccc-1111-4000-8000-000000000010'
      and call_kind = 'chat_response'
      and attempt = 0
  $$,
  array[2::bigint],
  'distinct provider-call IDs remain separately billable under one logical attempt'
);
select results_eq(
  $$
    select concat_ws('|', total_users, user_id, provider_calls)
    from public.admin_model_usage_users(
      '2026-07-31 00:00:00+00', '2026-08-01 00:00:00+00',
      'estimated_cost', 'desc', 100, 0
    )
    where user_id = '22222222-2222-4222-8222-222222222222'
  $$,
  array['2|22222222-2222-4222-8222-222222222222|0'],
  'registered users with zero telemetry remain visible'
);

insert into public.model_usage_calls (
  id, user_id, request_id, call_kind, attempt, chat_mode, surface,
  requested_model_id, resolved_model_id, provider, provider_model_id,
  status, input_tokens, no_cache_input_tokens, output_tokens, total_tokens,
  duration_ms, estimated_cost_nanousd, pricing_version, cost_status,
  started_at, completed_at
) values (
  'cccccccc-0000-4000-8000-000000000020',
  '22222222-2222-4222-8222-222222222222',
  'cccccccc-1111-4000-8000-000000000020',
  'chat_response', 0, 'persistent', 'main', 'gpt-5.4', 'gpt-5.4',
  'openai', 'gpt-5.4', 'completed', 30, 30, 20, 50,
  80, null, null, 'missing_price',
  '2026-07-31 11:00:00+00', '2026-07-31 11:00:00.080+00'
);

select results_eq(
  $$
    select concat_ws(
      '|', responses, provider_calls, total_tokens,
      estimated_cost_nanousd, estimated_chat_cost_nanousd
    )
    from public.admin_model_usage_overview(
      '2026-07-31 00:00:00+00', '2026-08-01 00:00:00+00'
    )
  $$,
  array['3|9|126|465|365'],
  'overview reconciles multi-surface responses, provider calls, tokens, and costs'
);
select results_eq(
  $$
    select count(distinct call_kind)
    from public.model_usage_calls
    where started_at >= '2026-07-31 00:00:00+00'
      and started_at < '2026-08-01 00:00:00+00'
  $$,
  array[6::bigint],
  'integrated telemetry fixture spans every instrumented call kind'
);
select results_eq(
  $$
    select concat_ws(
      '|', usage_reported_calls, billable_usage_calls, priced_calls,
      missing_usage_calls, missing_price_calls
    )
    from public.admin_model_usage_overview(
      '2026-07-31 00:00:00+00', '2026-08-01 00:00:00+00'
    )
  $$,
  array['8|9|8|0|1'],
  'overview keeps usage and pricing coverage denominators separate'
);
select results_eq(
  $$
    select concat_ws(
      '|', primary_responses, auxiliary_calls, estimated_cost_nanousd,
      billable_usage_calls, priced_calls
    )
    from public.admin_model_usage_models(
      '2026-07-31 00:00:00+00', '2026-08-01 00:00:00+00'
    )
    where model_key = 'gpt-5.5'
  $$,
  array['1|4|450|6|6'],
  'model aggregates separate primary response actions from auxiliary calls'
);
select results_eq(
  $$
    select concat_ws(
      '|', completed_calls, usage_reported_calls, billable_usage_calls,
      priced_calls, missing_price_calls
    )
    from public.admin_model_usage_users(
      '2026-07-31 00:00:00+00', '2026-08-01 00:00:00+00',
      'estimated_cost', 'desc', 100, 0
    )
    where user_id = '11111111-1111-4111-8111-111111111111'
  $$,
  array['7|7|8|8|0'],
  'user coverage separates completed usage reporting from all billable calls'
);
select throws_ok(
  $$
    select * from public.admin_model_usage_users(
      '2026-07-31 00:00:00+00', '2026-08-01 00:00:00+00',
      'user_supplied_sql', 'desc', 50, 0
    )
  $$,
  '22023'::char(5),
  'invalid usage sort',
  'user aggregate rejects non-allowlisted sort keys'
);

delete from public.chat_runs
where id = 'aaaaaaaa-0000-4000-8000-000000000001';
select results_eq(
  $$select run_id is null from public.model_usage_calls where id = 'cccccccc-0000-4000-8000-000000000010'$$,
  array[true],
  'deleting a run nulls only the optional telemetry correlation'
);

delete from auth.users
where id = '22222222-2222-4222-8222-222222222222';
select is_empty(
  $$select id from public.model_usage_calls where user_id = '22222222-2222-4222-8222-222222222222'$$,
  'deleting an account removes its telemetry attribution'
);

select * from finish();
rollback;

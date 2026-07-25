import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(process.cwd(), '..', 'supabase', 'migrations', '20260719010000_chat_runs.sql'),
  'utf8'
).toLowerCase();
const atomicCompletionMigration = readFileSync(
  join(
    process.cwd(),
    '..',
    'supabase',
    'migrations',
    '20260720150000_atomic_chat_run_completion.sql'
  ),
  'utf8'
).toLowerCase();
const targetIntegrityMigration = readFileSync(
  join(
    process.cwd(),
    '..',
    'supabase',
    'migrations',
    '20260725150000_harden_chat_run_target_integrity.sql'
  ),
  'utf8'
).toLowerCase();

describe('persistent chat runs migration', () => {
  it('creates idempotent persistent runs with active-tail uniqueness and atomic commits', () => {
    expect(migration).toContain('create table if not exists public.chat_runs');
    expect(migration).toContain('chat_runs_active_scope_idx');
    expect(migration).toContain('where status in');
    expect(migration).toContain("'disposition', 'reattach'");
    expect(migration).toContain('an identical retry can race the original insert');
    expect(migration).toContain('commit_persistent_chat_run_response');
    expect(migration).toContain('for update');
  });

  it('contains no temporary-chat persistence, branches, quotas, or cleanup work', () => {
    for (const forbidden of [
      'temporary_chat_runs',
      'temporary_chat_run_attachments',
      'p_mode',
      'p_request_payload',
      'p_ttl_seconds',
      'payload_bytes',
      'cleanup_expired_temporary_chat_runs',
      'cron.schedule',
      'expires_at',
      "'temporary'",
    ]) {
      expect(migration).not.toContain(forbidden);
    }
  });

  it('adds title provenance and content-free persistent run events', () => {
    expect(migration).toContain("title_source text not null default 'fallback'");
    expect(migration).toContain('title_version integer not null default 0');
    const eventsTable = migration.slice(
      migration.indexOf('create table if not exists public.chat_run_events'),
      migration.indexOf('alter table public.chat_runs enable row level security')
    );
    expect(eventsTable).not.toContain('response_text');
    expect(eventsTable).not.toContain('request_payload');
    expect(eventsTable).not.toContain('mode text');
  });

  it('makes assistant persistence and run completion one transaction', () => {
    expect(atomicCompletionMigration).toContain("set status = 'completed'");
    expect(atomicCompletionMigration).toContain("response_status = 'completed'");
    expect(atomicCompletionMigration).toContain('completed_at = now()');
    expect(atomicCompletionMigration).toContain('search_status = p_run_search_status');
    expect(atomicCompletionMigration).not.toContain("set status = 'finalizing'");
  });

  it('derives active-run scope and durable message ancestry from validated targets', () => {
    for (const sql of [migration, targetIntegrityMigration]) {
      expect(sql).toContain('scope_key = v_scope_key');
      expect(sql).toContain('p_created_branch_id is distinct from v_branch_id');
      expect(sql).toContain('p_created_thread_id is distinct from v_thread_id');
      expect(sql).toContain(
        'v_expected_predecessor_id is distinct from v_branch_source_message_id'
      );
    }

    for (const sql of [atomicCompletionMigration, targetIntegrityMigration]) {
      expect(sql).toContain('v_parent_message_id is distinct from p_parent_message_id');
      expect(sql).toContain(
        'user_message.previous_message_id is not distinct from'
      );
      expect(sql).toContain(
        'v_message.parent_message_id is distinct from v_parent_message_id'
      );
    }
  });
});

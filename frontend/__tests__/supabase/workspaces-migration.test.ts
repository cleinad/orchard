import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const baselineSql = readFileSync(
  new URL(
    '../../../supabase/migrations/20260719001000_production_schema_baseline.sql',
    import.meta.url
  ),
  'utf8'
).replaceAll('"', '').toLowerCase();
const memoryRemovalSql = readFileSync(
  new URL(
    '../../../supabase/migrations/20260729120000_remove_persistent_memory.sql',
    import.meta.url
  ),
  'utf8'
).toLowerCase();
const moveRpcSql = memoryRemovalSql.slice(
  memoryRemovalSql.indexOf('create function public.move_conversation_context'),
  memoryRemovalSql.indexOf(
    'revoke all\non function public.move_conversation_context'
  )
);
const deleteRpcSql = memoryRemovalSql.slice(
  memoryRemovalSql.indexOf('create function public.delete_workspace_cascade'),
  memoryRemovalSql.indexOf(
    'revoke all\non function public.delete_workspace_cascade'
  )
);

describe('workspaces migration', () => {
  it('contains the complete workspace and memory schema in the production baseline', () => {
    expect(baselineSql).toContain('create table if not exists public.workspaces');
    expect(baselineSql).toContain('create table if not exists public.memory_items');
    expect(baselineSql).toContain('create table if not exists public.memory_item_sources');
  });

  it('constrains workspace cascades to same-owner conversations', () => {
    expect(baselineSql).toContain('add constraint conversations_workspace_id_fkey');
    expect(baselineSql).toContain('foreign key (workspace_id) references public.workspaces(id) on delete cascade');
    expect(memoryRemovalSql).toContain(
      'add constraint workspaces_id_user_id_key\n  unique (id, user_id)'
    );
    expect(memoryRemovalSql).toContain(
      'add constraint conversations_workspace_user_id_fkey\n  foreign key (workspace_id, user_id)'
    );
    expect(memoryRemovalSql).toContain(
      'references public.workspaces (id, user_id)\n  on delete cascade'
    );
    expect(memoryRemovalSql).toContain(
      'drop constraint conversations_workspace_id_fkey'
    );
  });

  it('defines the final workspace delete RPC without memory behavior', () => {
    expect(deleteRpcSql).toContain('security invoker');
    expect(deleteRpcSql).toContain('v_user_id uuid := auth.uid()');
    expect(deleteRpcSql).toContain(
      'array_agg(locked_conversations.id order by locked_conversations.id)'
    );
    expect(deleteRpcSql).toMatch(
      /from \(\s+select id\s+from public\.conversations[\s\S]+?order by id\s+for update\s+\) as locked_conversations/
    );
    expect(deleteRpcSql).toContain(
      'lock table public.message_attachments\n  in share row exclusive mode'
    );
    expect(deleteRpcSql).toContain('delete from public.conversations');
    expect(deleteRpcSql).toContain('delete from public.workspaces');
    expect(deleteRpcSql).toContain(
      "'storage_paths', to_jsonb(v_storage_paths)"
    );
    expect(deleteRpcSql).not.toContain('memory');
  });

  it('drops canonical and development-only memory objects without cascading', () => {
    for (const objectName of [
      'memory_operation_items',
      'memory_planner_runs',
      'memory_item_embeddings',
      'memory_item_sources',
      'memory_items',
      'memory_operations',
      'memory_extraction_finalizations',
      'memory_extraction_marks',
      'memory_extraction_runs',
      'memory_extraction_states',
      'memory_files',
    ]) {
      expect(memoryRemovalSql).toContain(
        `drop table if exists public.${objectName} restrict`
      );
    }
    expect(memoryRemovalSql).toContain(
      'drop view if exists public.memory_planner_daily_metrics restrict'
    );
    expect(memoryRemovalSql).toContain("p.proname ilike '%memory%'");
    expect(memoryRemovalSql).toContain('drop extension if exists vector restrict');
    expect(memoryRemovalSql).toContain('drop extension if exists pg_trgm restrict');
    expect(memoryRemovalSql).not.toMatch(/\bdrop\b[^;]*\bcascade\s*;/);
  });

  it('defines the final two-argument conversation move behavior', () => {
    expect(memoryRemovalSql).toContain(
      'drop function if exists\n  public.move_conversation_context(uuid, uuid, text)'
    );
    expect(moveRpcSql).toContain('p_conversation_id uuid');
    expect(moveRpcSql).toContain('p_workspace_id uuid default null');
    expect(moveRpcSql).toContain('security invoker');
    expect(moveRpcSql).toContain('for update');
    expect(moveRpcSql).toContain("error', 'mentor_context_unsupported'");
    expect(moveRpcSql).toContain("error', 'noop'");
    expect(moveRpcSql).toContain('set workspace_id = p_workspace_id');
    expect(moveRpcSql).not.toContain('memory');
  });

  it('restricts workspace RPC execution to authenticated and service roles', () => {
    for (const signature of [
      'public.move_conversation_context(uuid, uuid)',
      'public.delete_workspace_cascade(uuid)',
    ]) {
      expect(memoryRemovalSql).toContain(
        `on function ${signature}\nfrom public, anon, authenticated, service_role`
      );
      expect(memoryRemovalSql).toContain(
        `on function ${signature}\nto authenticated, service_role`
      );
    }
  });
});

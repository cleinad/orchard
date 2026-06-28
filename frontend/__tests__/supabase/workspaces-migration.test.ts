import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationSql = readFileSync(
  new URL('../../../supabase/migrations/20260625120000_workspaces_v1.sql', import.meta.url),
  'utf8'
);
const deleteCascadeMigrationSql = readFileSync(
  new URL(
    '../../../supabase/migrations/20260627120000_workspace_delete_cascade.sql',
    import.meta.url
  ),
  'utf8'
);
const memorySourcesMigrationSql = readFileSync(
  new URL(
    '../../../supabase/migrations/20260627130000_memory_sources_and_conversation_context_moves.sql',
    import.meta.url
  ),
  'utf8'
);

describe('workspaces migration', () => {
  it('drops foreign keys attached to memory_items.owner_id without relying on rendered FK text', () => {
    expect(migrationSql).toContain("a.attname = 'owner_id'");
    expect(migrationSql).toContain("c.contype = 'f'");
    expect(migrationSql).toContain('alter table public.memory_items drop constraint if exists %I');
    expect(migrationSql).not.toContain('pg_get_constraintdef');
    expect(migrationSql).not.toContain('REFERENCES public.mentors');
  });

  it('keeps workspace conversation deletion as a cascade', () => {
    expect(deleteCascadeMigrationSql).toContain('drop constraint if exists conversations_workspace_id_fkey');
    expect(deleteCascadeMigrationSql).toContain('foreign key (workspace_id)');
    expect(deleteCascadeMigrationSql).toContain('references public.workspaces(id)');
    expect(deleteCascadeMigrationSql).toContain('on delete cascade');
  });

  it('defines an atomic workspace delete RPC for scoped database cleanup', () => {
    expect(deleteCascadeMigrationSql).toContain(
      'create or replace function public.delete_workspace_cascade'
    );
    expect(deleteCascadeMigrationSql).toContain('returns jsonb');
    expect(deleteCascadeMigrationSql).toContain('v_user_id uuid := auth.uid()');
    expect(deleteCascadeMigrationSql).toContain("owner_type = 'workspace'");
    expect(deleteCascadeMigrationSql).toContain('delete from public.memory_item_embeddings');
    expect(deleteCascadeMigrationSql).toContain('delete from public.memory_items');
    expect(deleteCascadeMigrationSql).toContain('delete from public.conversations');
    expect(deleteCascadeMigrationSql).toContain('delete from public.workspaces');
    expect(deleteCascadeMigrationSql).toContain("'storage_paths', to_jsonb(v_storage_paths)");
    expect(deleteCascadeMigrationSql).toContain(
      'grant execute on function public.delete_workspace_cascade(uuid) to authenticated'
    );
  });

  it('adds memory provenance sources with RLS and a compatibility backfill', () => {
    expect(memorySourcesMigrationSql).toContain(
      'create table if not exists public.memory_item_sources'
    );
    expect(memorySourcesMigrationSql).toContain(
      'memory_item_id uuid not null references public.memory_items(id) on delete cascade'
    );
    expect(memorySourcesMigrationSql).toContain(
      'conversation_id uuid references public.conversations(id) on delete set null'
    );
    expect(memorySourcesMigrationSql).toContain(
      "unique nulls not distinct (memory_item_id, conversation_id, message_id, contribution_type)"
    );
    expect(memorySourcesMigrationSql).toContain(
      'alter table public.memory_item_sources enable row level security'
    );
    expect(memorySourcesMigrationSql).toContain('auth.uid() = user_id');
    expect(memorySourcesMigrationSql).toContain('memory_items.user_id = auth.uid()');
    expect(memorySourcesMigrationSql).toContain('from public.memory_items');
    expect(memorySourcesMigrationSql).toContain('source_conversation_id');
    expect(memorySourcesMigrationSql).toContain(
      'on conflict (memory_item_id, conversation_id, message_id, contribution_type) do nothing'
    );
  });

  it('defines a conservative conversation move RPC that protects workspace memory', () => {
    expect(memorySourcesMigrationSql).toContain(
      'create or replace function public.move_conversation_context'
    );
    expect(memorySourcesMigrationSql).toContain('p_memory_policy text default');
    expect(memorySourcesMigrationSql).toContain("p_memory_policy is distinct from 'conservative'");
    expect(memorySourcesMigrationSql).toContain('for update');
    expect(memorySourcesMigrationSql).toContain("error', 'mentor_context_unsupported'");
    expect(memorySourcesMigrationSql).toContain("error', 'noop'");
    expect(memorySourcesMigrationSql).toContain('from public.memory_item_sources mis');
    expect(memorySourcesMigrationSql).toContain('other_sources.conversation_id <> p_conversation_id');
    expect(memorySourcesMigrationSql).toContain("set owner_type = 'workspace'");
    expect(memorySourcesMigrationSql).toContain('set workspace_id = p_workspace_id');
    expect(memorySourcesMigrationSql).toContain("'leftInPlace'");
    expect(memorySourcesMigrationSql).toContain(
      'grant execute on function public.move_conversation_context(uuid, uuid, text) to authenticated'
    );
  });
});

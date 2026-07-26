import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const baselineSql = readFileSync(
  new URL(
    '../../../supabase/migrations/20260719001000_production_schema_baseline.sql',
    import.meta.url
  ),
  'utf8'
).replaceAll('"', '').toLowerCase();

describe('workspaces migration', () => {
  it('contains the complete workspace and memory schema in the production baseline', () => {
    expect(baselineSql).toContain('create table if not exists public.workspaces');
    expect(baselineSql).toContain('create table if not exists public.memory_items');
    expect(baselineSql).toContain('create table if not exists public.memory_item_sources');
  });

  it('keeps workspace conversation deletion as a cascade', () => {
    expect(baselineSql).toContain('add constraint conversations_workspace_id_fkey');
    expect(baselineSql).toContain('foreign key (workspace_id) references public.workspaces(id) on delete cascade');
  });

  it('defines an atomic workspace delete RPC for scoped database cleanup', () => {
    expect(baselineSql).toContain(
      'create or replace function public.delete_workspace_cascade'
    );
    expect(baselineSql).toContain('returns jsonb');
    expect(baselineSql).toContain('v_user_id uuid := auth.uid()');
    expect(baselineSql).toContain("owner_type = 'workspace'");
    expect(baselineSql).toContain('delete from public.memory_item_embeddings');
    expect(baselineSql).toContain('delete from public.memory_items');
    expect(baselineSql).toContain('delete from public.conversations');
    expect(baselineSql).toContain('delete from public.workspaces');
    expect(baselineSql).toContain("'storage_paths', to_jsonb(v_storage_paths)");
    expect(baselineSql).toContain(
      'grant all on function public.delete_workspace_cascade(p_workspace_id uuid) to authenticated'
    );
  });

  it('adds memory provenance sources with RLS and a compatibility backfill', () => {
    expect(baselineSql).toContain(
      'create table if not exists public.memory_item_sources'
    );
    expect(baselineSql).toContain('memory_item_sources_memory_item_id_fkey');
    expect(baselineSql).toContain('memory_item_sources_conversation_id_fkey');
    expect(baselineSql).toContain('alter table public.memory_item_sources enable row level security');
    expect(baselineSql).toContain('auth.uid() = user_id');
  });

  it('defines a conservative conversation move RPC that protects workspace memory', () => {
    expect(baselineSql).toContain(
      'create or replace function public.move_conversation_context'
    );
    expect(baselineSql).toContain('p_memory_policy text default');
    expect(baselineSql).toContain("p_memory_policy is distinct from 'conservative'");
    expect(baselineSql).toContain('for update');
    expect(baselineSql).toContain("error', 'mentor_context_unsupported'");
    expect(baselineSql).toContain("error', 'noop'");
    expect(baselineSql).toContain('from public.memory_item_sources mis');
    expect(baselineSql).toContain('other_sources.conversation_id <> p_conversation_id');
    expect(baselineSql).toContain('set owner_type = \'workspace\'');
    expect(baselineSql).toContain('set workspace_id = p_workspace_id');
    expect(baselineSql).toContain("'leftinplace'");
    expect(baselineSql).toContain(
      'grant all on function public.move_conversation_context(p_conversation_id uuid, p_workspace_id uuid, p_memory_policy text) to authenticated'
    );
  });
});

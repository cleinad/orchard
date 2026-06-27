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
});

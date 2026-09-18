import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationSql = readFileSync(
  new URL(
    '../../../supabase/migrations/20260915110000_delete_conversation_cascade.sql',
    import.meta.url
  ),
  'utf8'
).toLowerCase();

describe('conversation delete migration', () => {
  it('defines an owned, security-invoker cascade with attachment-path cleanup data', () => {
    expect(migrationSql).toContain('create or replace function public.delete_conversation_cascade');
    expect(migrationSql).toContain('security invoker');
    expect(migrationSql).toContain('v_user_id uuid := auth.uid()');
    expect(migrationSql).toContain('from public.conversations');
    expect(migrationSql).toContain('and user_id = v_user_id');
    expect(migrationSql).toContain('for update');
    expect(migrationSql).toContain(
      'lock table public.message_attachments in share row exclusive mode'
    );
    expect(migrationSql).toContain('from public.message_attachments attachments');
    expect(migrationSql).toContain('delete from public.conversations');
    expect(migrationSql).toContain("'storage_paths', to_jsonb(v_storage_paths)");
  });

  it('restricts execution to authenticated and service roles', () => {
    expect(migrationSql).toContain(
      'on function public.delete_conversation_cascade(uuid) to authenticated, service_role'
    );
    expect(migrationSql).toContain(
      'on function public.delete_conversation_cascade(uuid) from public, anon'
    );
  });
});

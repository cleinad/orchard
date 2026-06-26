import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationSql = readFileSync(
  new URL('../../../supabase/migrations/20260625120000_workspaces_v1.sql', import.meta.url),
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
});

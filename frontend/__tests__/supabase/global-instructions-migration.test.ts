import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationSql = readFileSync(
  new URL(
    '../../../supabase/migrations/20260729130000_add_global_instructions.sql',
    import.meta.url
  ),
  'utf8'
).toLowerCase();

const baselineSql = readFileSync(
  new URL(
    '../../../supabase/migrations/20260719001000_production_schema_baseline.sql',
    import.meta.url
  ),
  'utf8'
).replaceAll('"', '').toLowerCase();

describe('global instructions migration', () => {
  it('adds a non-null profile field with an empty default', () => {
    expect(migrationSql).toContain('alter table public.profiles');
    expect(migrationSql).toContain(
      "add column global_instructions text not null default ''"
    );
  });

  it('enforces the 4,000-character storage limit', () => {
    expect(migrationSql).toContain(
      'constraint profiles_global_instructions_length_check'
    );
    expect(migrationSql).toContain(
      'check (char_length(global_instructions) <= 4000)'
    );
  });

  it('reuses the existing authenticated profile policies', () => {
    expect(baselineSql).toContain(
      'create policy users can view own profile on public.profiles for select'
    );
    expect(baselineSql).toContain(
      'create policy users can update own profile on public.profiles for update'
    );
  });
});

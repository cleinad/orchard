import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationSql = readFileSync(
  new URL(
    '../../../supabase/migrations/20260801130000_repair_storage_object_policies.sql',
    import.meta.url
  ),
  'utf8'
)
  .replaceAll('"', '')
  .toLowerCase();

describe('Storage object policy repair migration', () => {
  it('recreates the complete authenticated Storage policy set', () => {
    expect(migrationSql.match(/create policy/g)).toHaveLength(7);
    expect(migrationSql.match(/to authenticated/g)).toHaveLength(7);

    for (const policyName of [
      'users can read own chat images',
      'users can upload own chat images',
      'users can update own chat images',
      'users can delete own chat images',
      'users can upload own mentor avatars',
      'users can update own mentor avatars',
      'users can delete own mentor avatars',
    ]) {
      expect(migrationSql).toContain(`drop policy if exists ${policyName}`);
      expect(migrationSql).toContain(`create policy ${policyName}`);
    }
  });

  it('scopes object access to the authenticated user folder in each bucket', () => {
    expect(migrationSql.match(/bucket_id = 'chat-images'/g)).toHaveLength(5);
    expect(migrationSql.match(/bucket_id = 'mentor-avatars'/g)).toHaveLength(4);
    expect(
      migrationSql.match(
        /storage\.foldername\(name\)\)\[1\] = \(select auth\.uid\(\)\)::text/g
      )
    ).toHaveLength(9);
  });

  it('does not weaken Storage row-level security', () => {
    expect(migrationSql).not.toContain('disable row level security');
    expect(migrationSql).not.toContain('to anon');
    expect(migrationSql).not.toContain('to public');
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationSql = readFileSync(
  new URL(
    '../../../supabase/migrations/20260730120000_repair_profile_provisioning.sql',
    import.meta.url
  ),
  'utf8'
)
  .replaceAll('"', '')
  .toLowerCase();

describe('profile provisioning migration', () => {
  it('hardens the security-definer trigger function', () => {
    expect(migrationSql).toContain(
      'create or replace function public.handle_new_user()'
    );
    expect(migrationSql).toContain('security definer');
    expect(migrationSql).toContain("set search_path = ''");
    expect(migrationSql).toContain(
      'revoke all on function public.handle_new_user()'
    );
  });

  it('installs the missing Auth user trigger', () => {
    expect(migrationSql).toContain(
      'create trigger on_auth_user_created'
    );
    expect(migrationSql).toContain('after insert on auth.users');
    expect(migrationSql).toContain(
      'for each row execute function public.handle_new_user()'
    );
  });

  it('does not comment on the platform-owned Auth trigger', () => {
    expect(migrationSql).not.toContain(
      'comment on trigger on_auth_user_created on auth.users'
    );
  });

  it('backfills missing profiles without overwriting existing rows', () => {
    expect(migrationSql).toContain('from auth.users as users');
    expect(migrationSql).toContain(
      'left join public.profiles as profiles on profiles.id = users.id'
    );
    expect(migrationSql).toContain('where profiles.id is null');
    expect(migrationSql).toContain('on conflict (id) do nothing');
  });
});

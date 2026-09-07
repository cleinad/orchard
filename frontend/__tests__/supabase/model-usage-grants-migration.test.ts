import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrations = [
  '20260731123000_harden_model_usage_grants.sql',
  '20260731124000_enforce_model_usage_grants.sql',
].map((filename) => readFileSync(
  join(process.cwd(), '..', 'supabase', 'migrations', filename),
  'utf8'
).toLowerCase());

describe('model usage service-role grant hardening migration', () => {
  it('removes broad table privileges before restoring the narrow contract', () => {
    for (const migration of migrations) {
      expect(migration).toContain(
        'revoke all on table public.model_usage_calls from service_role'
      );
      expect(migration).toContain(
        'grant insert, select on table public.model_usage_calls to service_role'
      );
      expect(migration).not.toMatch(/\b(update|delete|truncate|references|trigger)\b/);
    }
  });
});

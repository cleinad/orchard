import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(process.cwd(), '..', 'supabase', 'migrations', '20260731120000_model_usage_telemetry.sql'),
  'utf8'
).toLowerCase();

describe('model usage telemetry migration', () => {
  it('creates additive content-free terminal call accounting', () => {
    expect(migration).toContain('create table public.model_usage_calls');
    expect(migration).toContain('references auth.users(id) on delete cascade');
    expect(migration).toContain('references public.chat_runs(id) on delete set null');
    expect(migration).toContain('completed_at timestamptz not null');
    expect(migration).not.toMatch(/\b(conversation_id|prompt|response_content|raw_usage|provider_metadata|search_query|source_url)\b/);
  });

  it('keeps browser roles away from rows and aggregate functions', () => {
    expect(migration).toContain('alter table public.model_usage_calls enable row level security');
    expect(migration).toContain(
      'revoke all on table public.model_usage_calls from public, anon, authenticated'
    );
    expect(migration).toContain(
      'grant insert, select on table public.model_usage_calls to service_role'
    );
    expect(migration).not.toMatch(/create policy[\s\S]*model_usage_calls/);
    expect(migration.match(/grant execute on function public\.admin_model_usage_/g)).toHaveLength(4);
  });

  it('defines the four bounded security-invoker aggregate surfaces', () => {
    for (const name of ['overview', 'daily', 'models', 'users']) {
      expect(migration).toContain(`function public.admin_model_usage_${name}`);
    }
    expect(migration.match(/security invoker/g)).toHaveLength(4);
    expect(migration.match(/set search_path = public, pg_temp/g)).toHaveLength(4);
    expect(migration).toContain("if p_limit < 1 or p_limit > 100 or p_offset < 0");
  });
});

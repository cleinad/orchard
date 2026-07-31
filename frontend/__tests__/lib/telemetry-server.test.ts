import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LanguageModelUsage } from 'ai';

vi.mock('server-only', () => ({}));

const sdkUsage: LanguageModelUsage = {
  inputTokens: 100,
  inputTokenDetails: {
    noCacheTokens: 90,
    cacheReadTokens: 10,
    cacheWriteTokens: undefined,
  },
  outputTokens: 20,
  outputTokenDetails: { textTokens: 15, reasoningTokens: 5 },
  totalTokens: 120,
};

describe('telemetry server writer', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('builds a content-free terminal row with immutable call-time cost', async () => {
    const { buildModelUsageCallRow } = await import('@/lib/telemetry/server');
    const row = buildModelUsageCallRow({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      userId: '11111111-1111-4111-8111-111111111111',
      requestId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      runId: null,
      callKind: 'chat_response',
      attempt: 0,
      chatMode: 'temporary',
      surface: 'inline_thread',
      requestedModelId: 'auto',
      resolvedModelId: 'gpt-5.5',
      provider: 'openai',
      providerModelId: 'gpt-5.5',
      startedAt: new Date('2026-07-31T00:00:00.000Z'),
    }, {
      status: 'completed',
      finishReason: 'stop',
      usage: sdkUsage,
      completedAt: new Date('2026-07-31T00:00:00.125Z'),
    });

    expect(row).toEqual(expect.objectContaining({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      chat_mode: 'temporary',
      surface: 'inline_thread',
      requested_model_id: 'auto',
      resolved_model_id: 'gpt-5.5',
      input_tokens: 100,
      reasoning_tokens: 5,
      duration_ms: 125,
      cost_status: 'priced',
      pricing_version: 'openai-2026-07-31',
    }));
    expect(Object.keys(row)).not.toEqual(expect.arrayContaining([
      'prompt',
      'response',
      'title',
      'query',
      'url',
      'provider_metadata',
    ]));
  });

  it('retries once with the same idempotency key and never throws', async () => {
    const { writeModelUsageCall, buildModelUsageCallRow } = await import(
      '@/lib/telemetry/server'
    );
    const upsert = vi
      .fn()
      .mockResolvedValueOnce({ error: { code: 'temporary' } })
      .mockResolvedValueOnce({ error: null });
    const client = { from: vi.fn(() => ({ upsert })) };
    const row = buildModelUsageCallRow({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      userId: '11111111-1111-4111-8111-111111111111',
      requestId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      callKind: 'mentor_generation',
      attempt: 0,
      surface: 'mentor',
      provider: 'openai',
      providerModelId: 'gpt-5.5',
      startedAt: new Date('2026-07-31T00:00:00.000Z'),
    }, {
      status: 'failed',
      completedAt: new Date('2026-07-31T00:00:00.050Z'),
    });

    await expect(writeModelUsageCall(row, {
      client: client as never,
      timeoutMs: 10,
    })).resolves.toBe(true);
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert.mock.calls[0][0].id).toBe(row.id);
    expect(upsert.mock.calls[1][0].id).toBe(row.id);
    expect(row.cost_status).toBe('failed_before_usage');
  });

  it('bounds both attempts when the database client never settles', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { writeModelUsageCall, buildModelUsageCallRow } = await import(
      '@/lib/telemetry/server'
    );
    const upsert = vi.fn(() => new Promise<never>(() => undefined));
    const client = { from: vi.fn(() => ({ upsert })) };
    const row = buildModelUsageCallRow({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      userId: '11111111-1111-4111-8111-111111111111',
      requestId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      callKind: 'chat_response',
      attempt: 0,
      chatMode: 'persistent',
      surface: 'main',
      provider: 'openai',
      providerModelId: 'gpt-5.5',
      startedAt: new Date('2026-07-31T00:00:00.000Z'),
    }, {
      status: 'completed',
      usage: sdkUsage,
      completedAt: new Date('2026-07-31T00:00:00.050Z'),
    });

    const write = writeModelUsageCall(row, {
      client: client as never,
      timeoutMs: 10,
    });
    await vi.advanceTimersByTimeAsync(20);

    await expect(write).resolves.toBe(false);
    expect(upsert).toHaveBeenCalledTimes(2);
  });

  it('warns with sanitized identifiers when pricing is unknown', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { recordModelUsageCall } = await import('@/lib/telemetry/server');

    await recordModelUsageCall({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      userId: '11111111-1111-4111-8111-111111111111',
      requestId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      callKind: 'search_plan',
      attempt: 0,
      chatMode: 'persistent',
      surface: 'main',
      provider: 'unknown provider',
      providerModelId: 'unknown\nmodel',
      startedAt: new Date('2026-07-31T00:00:00.000Z'),
    }, {
      status: 'completed',
      usage: sdkUsage,
      completedAt: new Date('2026-07-31T00:00:00.050Z'),
    });

    expect(warning).toHaveBeenCalledWith(
      '[telemetry] model price unavailable',
      {
        code: 'missing_price',
        provider: 'unknown?provider',
        providerModelId: 'unknown?model',
      }
    );
  });
});

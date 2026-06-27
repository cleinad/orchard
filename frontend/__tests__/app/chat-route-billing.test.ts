import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createMockSupabase } from '../helpers/mock-supabase';

const mockCreateSupabaseServerClient = vi.fn();
const mockResolveChatModelSelection = vi.fn();
const mockGetChatModel = vi.fn();
const mockStreamText = vi.fn();

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  return {
    ...actual,
    after: (callback: () => unknown) => callback(),
  };
});

vi.mock('ai', () => ({
  generateText: vi.fn(),
  streamText: (...args: unknown[]) => mockStreamText(...args),
  createUIMessageStream: ({ execute }: { execute: (params: { writer: { write: () => void; merge: () => void } }) => void }) => {
    execute({ writer: { write: () => undefined, merge: () => undefined } });
    return new ReadableStream({ start(controller) { controller.close(); } });
  },
  createUIMessageStreamResponse: ({ stream }: { stream: ReadableStream }) =>
    new Response(stream, { status: 200 }),
}));

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: () => mockCreateSupabaseServerClient(),
}));

vi.mock('@/lib/memory-reader', () => ({
  loadMemoryContextV2: vi.fn().mockResolvedValue(''),
}));

vi.mock('@/lib/memory-agent', () => ({
  processMemoryV2: vi.fn(),
}));

vi.mock('@/lib/models', () => ({
  getChatModel: (...args: unknown[]) => mockGetChatModel(...args),
  resolveChatModelSelection: (...args: unknown[]) =>
    mockResolveChatModelSelection(...args),
}));

vi.mock('@/lib/search/pipeline', () => ({
  runSearchPipeline: vi.fn(),
}));

vi.mock('@/lib/mentors/prompts', () => ({
  buildMentorPrompt: vi.fn(() => 'Mentor prompt'),
}));

function createAuthenticatedSupabase(options: Parameters<typeof createMockSupabase>[0] = {}) {
  const { client, tracker } = createMockSupabase(options);
  const supabase = {
    ...client,
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'user-1' } },
        error: null,
      }),
    },
  };

  return { supabase, tracker };
}

async function postChat(body: Record<string, unknown>, options?: Parameters<typeof createMockSupabase>[0]) {
  const { supabase, tracker } = createAuthenticatedSupabase(options);
  mockCreateSupabaseServerClient.mockResolvedValue(supabase);
  const { POST } = await import('@/app/api/chat/route');
  const response = await POST(
    new NextRequest('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  );

  return { response, tracker };
}

describe('chat route billing enforcement', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv('STRIPE_PRICE_MONTHLY_ID', 'price_monthly');
    mockResolveChatModelSelection.mockReturnValue({
      id: 'deepseek-v4-flash',
      requestedId: 'auto',
      provider: 'deepseek',
      label: 'Auto',
      apiModelId: 'deepseek-v4-flash',
    });
    mockGetChatModel.mockReturnValue('mock-model');
    mockStreamText.mockReturnValue({ toUIMessageStream: () => undefined });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('blocks paid model access for free users before model invocation', async () => {
    mockResolveChatModelSelection.mockReturnValue({
      id: 'gpt-5.4',
      requestedId: 'gpt-5.4',
      provider: 'openai',
      label: 'GPT 5.4',
      apiModelId: 'gpt-5.4',
    });

    const { response } = await postChat(
      { message: 'Use the paid model', modelId: 'gpt-5.4', chatMode: 'temporary' },
      { tables: { profiles: { rows: [{ full_name: 'Test User' }] } } }
    );

    expect(response.status).toBe(402);
    expect(await response.json()).toMatchObject({
      code: 'billing_upgrade_required',
    });
    expect(mockGetChatModel).not.toHaveBeenCalled();
    expect(mockStreamText).not.toHaveBeenCalled();
  });

  it('does not create a persistent conversation when paid-model billing blocks the first message', async () => {
    mockResolveChatModelSelection.mockReturnValue({
      id: 'gpt-5.4',
      requestedId: 'gpt-5.4',
      provider: 'openai',
      label: 'GPT 5.4',
      apiModelId: 'gpt-5.4',
    });

    const { response, tracker } = await postChat(
      { message: 'Start a paid-model chat', modelId: 'gpt-5.4' },
      { tables: { profiles: { rows: [{ full_name: 'Test User' }] } } }
    );

    expect(response.status).toBe(402);
    expect(tracker.inserts('conversations')).toHaveLength(0);
    expect(mockGetChatModel).not.toHaveBeenCalled();
    expect(mockStreamText).not.toHaveBeenCalled();
  });

  it('does not create a persistent conversation when usage limits block the first message', async () => {
    const { response, tracker } = await postChat(
      { message: 'Start an over-limit chat' },
      {
        tables: { profiles: { rows: [{ full_name: 'Test User' }] } },
        rpcResults: {
          consume_chat_usage_limits: {
            data: [{
              allowed: false,
              monthly_used_count: 3,
              monthly_limit: 250,
              window_used_count: 20,
              window_limit: 20,
              monthly_premium_used_count: 0,
              monthly_premium_limit: 0,
              window_premium_used_count: 0,
              window_premium_limit: 0,
              blocked_limit: 'window_total',
            }],
            error: null,
          },
        },
      }
    );

    expect(response.status).toBe(429);
    expect(tracker.inserts('conversations')).toHaveLength(0);
    expect(mockGetChatModel).not.toHaveBeenCalled();
    expect(mockStreamText).not.toHaveBeenCalled();
  });

  it('blocks over-limit users before model invocation', async () => {
    const { response } = await postChat(
      { message: 'Hello', chatMode: 'temporary' },
      {
        tables: { profiles: { rows: [{ full_name: 'Test User' }] } },
        rpcResults: {
          consume_chat_usage_limits: {
            data: [{
              allowed: false,
              monthly_used_count: 250,
              monthly_limit: 250,
              window_used_count: 12,
              window_limit: 20,
              monthly_premium_used_count: 0,
              monthly_premium_limit: 0,
              window_premium_used_count: 0,
              window_premium_limit: 0,
              blocked_limit: 'monthly_total',
            }],
            error: null,
          },
        },
      }
    );

    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({
      code: 'billing_usage_limit_reached',
      usage: {
        monthly: { used: 250, limit: 250 },
        rolling: { used: 12, limit: 20 },
      },
      blockedLimit: 'monthly_total',
    });
    expect(mockGetChatModel).not.toHaveBeenCalled();
    expect(mockStreamText).not.toHaveBeenCalled();
  });
});

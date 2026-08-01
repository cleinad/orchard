import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mockGenerateObject = vi.hoisted(() => vi.fn());
const mockCreateSupabaseServerClient = vi.hoisted(() => vi.fn());
const mockGetChatModel = vi.hoisted(() => vi.fn((modelId?: string) => {
  void modelId;
  return 'mentor-model';
}));
const mockResolveChatModelSelection = vi.hoisted(() => vi.fn((modelId?: string | null) => {
  void modelId;
  return {
    id: 'gpt-5.5',
    requestedId: 'auto',
    provider: 'openai',
    apiModelId: 'gpt-5.5',
  };
}));
const mockRecordModelUsage = vi.hoisted(() => vi.fn());
const mockStartDeferredModelUsageCall = vi.hoisted(() => vi.fn(
  (context: unknown) => (terminal: unknown) =>
    mockRecordModelUsage(context, terminal)
));

vi.mock('ai', () => ({
  generateObject: (...args: unknown[]) => mockGenerateObject(...args),
}));
vi.mock('@/lib/models', () => ({
  getChatModel: (modelId: string) => mockGetChatModel(modelId),
  resolveChatModelSelection: (modelId: string | null) =>
    mockResolveChatModelSelection(modelId),
}));
vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: () => mockCreateSupabaseServerClient(),
}));
vi.mock('@/lib/telemetry/deferred', () => ({
  startDeferredModelUsageCall: (context: unknown) =>
    mockStartDeferredModelUsageCall(context),
}));

import { POST } from '@/app/api/mentors/generate/route';

function request() {
  return new NextRequest('http://localhost/api/mentors/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      prompt: 'Create a practical systems design mentor.',
    }),
  });
}

describe('mentor generation telemetry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: {
              id: '11111111-1111-4111-8111-111111111111',
            },
          },
          error: null,
        }),
      },
    });
    mockResolveChatModelSelection.mockReturnValue({
      id: 'gpt-5.5',
      requestedId: 'auto',
      provider: 'openai',
      apiModelId: 'gpt-5.5',
    });
  });

  it('records completed generation without including the mentor prompt', async () => {
    const usage = {
      inputTokens: 100,
      outputTokens: 40,
      totalTokens: 140,
    };
    mockGenerateObject.mockResolvedValue({
      object: {
        name: 'Systems Guide',
        tagline: 'Design dependable systems',
        description: 'A practical systems design mentor.',
        base_system_prompt: 'You are a systems design mentor. '.repeat(12),
      },
      finishReason: 'stop',
      usage,
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mockStartDeferredModelUsageCall).toHaveBeenCalledWith({
      userId: '11111111-1111-4111-8111-111111111111',
      requestId: expect.any(String),
      runId: null,
      callKind: 'mentor_generation',
      attempt: 0,
      chatMode: null,
      surface: 'mentor',
      requestedModelId: null,
      resolvedModelId: 'gpt-5.5',
      provider: 'openai',
      providerModelId: 'gpt-5.5',
    });
    expect(mockStartDeferredModelUsageCall.mock.calls[0]?.[0])
      .not.toHaveProperty('prompt');
    expect(mockRecordModelUsage).toHaveBeenCalledWith(
      expect.anything(),
      {
        status: 'completed',
        finishReason: 'stop',
        usage,
      }
    );
  });

  it('records a failed terminal call without changing the route failure boundary', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mockGenerateObject.mockRejectedValue(new Error('provider unavailable'));

    const response = await POST(request());

    expect(response.status).toBe(500);
    expect(mockRecordModelUsage).toHaveBeenCalledWith(
      expect.anything(),
      { status: 'failed' }
    );
  });
});

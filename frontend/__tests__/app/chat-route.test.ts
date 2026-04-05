import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createMockSupabase } from '../helpers/mock-supabase';

const mockAfter = vi.fn((callback: () => unknown) => callback());
const mockGenerateText = vi.fn();
const mockCreateSupabaseServerClient = vi.fn();
const mockLoadMemoryContextV2 = vi.fn();
const mockProcessMemoryV2 = vi.fn();

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  return {
    ...actual,
    after: (callback: () => unknown) => mockAfter(callback),
  };
});

vi.mock('ai', () => ({
  generateText: (...args: unknown[]) => mockGenerateText(...args),
  stepCountIs: vi.fn(() => undefined),
}));

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: () => mockCreateSupabaseServerClient(),
}));

vi.mock('@/lib/memory-reader', () => ({
  loadMemoryContextV2: (...args: unknown[]) => mockLoadMemoryContextV2(...args),
}));

vi.mock('@/lib/memory-agent', () => ({
  processMemoryV2: (...args: unknown[]) => mockProcessMemoryV2(...args),
}));

vi.mock('@/lib/models', () => ({
  CHAT_MODEL: 'mock-chat-model',
}));

vi.mock('@/lib/chat-search', () => ({
  addSearchInstructions: (prompt: string) => prompt,
  applySearchDisclosure: (text: string) => text,
  createSearchMetadataFromOutput: vi.fn(),
  createUnavailableSearchMetadata: (mode: string) => ({
    mode,
    status: 'unavailable',
  }),
  extractSearchMetadata: vi.fn(),
}));

vi.mock('@/lib/tools', () => ({
  runWebSearch: vi.fn(),
  webSearch: {},
}));

vi.mock('@/lib/mentors/prompts', () => ({
  buildMentorPrompt: vi.fn(),
}));

describe('chat route memory handoff', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateText.mockResolvedValue({ text: 'Assistant reply' });
    mockLoadMemoryContextV2.mockResolvedValue('');
    mockProcessMemoryV2.mockResolvedValue(undefined);
  });

  it('passes the authenticated Supabase client into processMemoryV2', async () => {
    const { client } = createMockSupabase({
      tables: {
        profiles: {
          rows: [{ full_name: 'Test User' }],
        },
        conversations: {
          rows: [],
          returnOnMutate: [{ id: 'conv-1' }],
        },
        messages: {
          rows: [{ role: 'user', content: 'Hello' }],
          returnOnMutate: [{ id: 'msg-user-1' }, { id: 'msg-assistant-1' }],
        },
      },
    });

    const supabase = {
      ...client,
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-1' } },
          error: null,
        }),
      },
    };

    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const { POST } = await import('@/app/api/chat/route');

    const request = new NextRequest('http://localhost/api/chat', {
      method: 'POST',
      body: JSON.stringify({ message: 'Hello' }),
      headers: {
        'content-type': 'application/json',
      },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.message).toBe('Assistant reply');
    expect(mockProcessMemoryV2).toHaveBeenCalledTimes(1);
    expect(mockProcessMemoryV2).toHaveBeenCalledWith(
      supabase,
      'user-1',
      [{ role: 'user', content: 'Hello' }],
      'Assistant reply',
      expect.objectContaining({
        conversationId: 'conv-1',
        sourceMessageId: 'msg-user-1',
        sourceRole: 'user',
      })
    );
  });
});

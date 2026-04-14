import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createMockSupabase } from '../helpers/mock-supabase';

const mockAfter = vi.fn((callback: () => unknown) => callback());
const mockGenerateText = vi.fn();
const mockGenerateObject = vi.fn();
const mockCreateSupabaseServerClient = vi.fn();
const mockLoadMemoryContextV2 = vi.fn();
const mockProcessMemoryV2 = vi.fn();
const mockBuildMentorPrompt = vi.fn();
const mockRunWebSearch = vi.fn();

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  return {
    ...actual,
    after: (callback: () => unknown) => mockAfter(callback),
  };
});

vi.mock('ai', () => ({
  generateText: (...args: unknown[]) => mockGenerateText(...args),
  generateObject: (...args: unknown[]) => mockGenerateObject(...args),
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
  getChatModel: vi.fn(() => 'mock-chat-model'),
  resolveChatModelSelection: vi.fn(() => ({
    id: 'gpt-5.4',
    provider: 'openai',
  })),
}));

vi.mock('@/lib/tools', () => ({
  runWebSearch: (...args: unknown[]) => mockRunWebSearch(...args),
}));

vi.mock('@/lib/mentors/prompts', () => ({
  buildMentorPrompt: (...args: unknown[]) => mockBuildMentorPrompt(...args),
}));

function createAuthenticatedSupabase(
  tables: Record<string, { rows: object[]; returnOnMutate?: object[] }> = {}
) {
  const { client, tracker } = createMockSupabase({
    tables: {
      profiles: {
        rows: [{ full_name: 'Test User' }],
      },
      ...tables,
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

  return { supabase, tracker };
}

async function runChatRequest(
  body: Record<string, unknown>,
  tables: Record<string, { rows: object[]; returnOnMutate?: object[] }> = {}
) {
  const { supabase, tracker } = createAuthenticatedSupabase(tables);
  mockCreateSupabaseServerClient.mockResolvedValue(supabase);

  const { POST } = await import('@/app/api/chat/route');

  const request = new NextRequest('http://localhost/api/chat', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
      'content-type': 'application/json',
    },
  });

  const response = await POST(request);
  const json = await response.json();

  return { response, body: json, tracker };
}

describe('chat route search citations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateText.mockResolvedValue({ text: 'Assistant reply' });
    mockGenerateObject.mockResolvedValue({
      object: {
        shouldSearch: false,
        query: null,
      },
    });
    mockLoadMemoryContextV2.mockResolvedValue('');
    mockProcessMemoryV2.mockResolvedValue(undefined);
    mockBuildMentorPrompt.mockReturnValue('Mentor base prompt');
    mockRunWebSearch.mockResolvedValue({
      status: 'success',
      query: 'latest company update',
      results: [
        {
          title: 'Source One',
          url: 'https://example.com/one',
          snippet: 'First source snippet',
        },
        {
          title: 'Source Two',
          url: 'https://example.com/two',
          snippet: 'Second source snippet',
        },
      ],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.TAVILY_API_KEY;
  });

  it('persists null search metadata when auto mode does not search', async () => {
    process.env.TAVILY_API_KEY = 'test-key';
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-02T03:04:05.000Z'));

    const { response, body, tracker } = await runChatRequest(
      { message: 'Help me brainstorm names', timezone: 'America/Vancouver' },
      {
        conversations: {
          rows: [],
          returnOnMutate: [{ id: 'conv-1' }],
        },
        messages: {
          rows: [{ role: 'user', content: 'Help me brainstorm names', search_metadata: null }],
          returnOnMutate: [{ id: 'msg-user-1' }, { id: 'msg-assistant-1' }],
        },
      }
    );

    expect(response.status).toBe(200);
    expect(body.search).toMatchObject({
      attempted: false,
      status: 'not_attempted',
      metadata: null,
    });
    expect(mockRunWebSearch).not.toHaveBeenCalled();
    expect(mockGenerateObject).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining(
          'The current time is 2026-01-01 19:04 (America/Vancouver).'
        ),
      })
    );
    expect(mockGenerateObject).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("The user's name is Test User."),
      })
    );

    const assistantInsert = tracker.inserts('messages')[1]?.args as {
      search_metadata?: unknown;
    };
    expect(assistantInsert.search_metadata).toBeNull();
  });

  it('persists normalized search metadata and strips invalid citations for required mode', async () => {
    process.env.TAVILY_API_KEY = 'test-key';
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-02T03:04:05.000Z'));
    mockGenerateText
      .mockResolvedValueOnce({ text: 'Grounded answer [1] [9]' })
      .mockResolvedValueOnce({ text: 'Grounded Title' });

    const { response, body, tracker } = await runChatRequest(
      {
        message: 'What changed this week?',
        searchEnabled: true,
        timezone: 'America/Vancouver',
      },
      {
        conversations: {
          rows: [],
          returnOnMutate: [{ id: 'conv-1' }],
        },
        messages: {
          rows: [{ role: 'user', content: 'What changed this week?', search_metadata: null }],
          returnOnMutate: [{ id: 'msg-user-1' }, { id: 'msg-assistant-1' }],
        },
      }
    );

    expect(response.status).toBe(200);
    expect(body.search).toMatchObject({
      attempted: true,
      status: 'success',
      resultCount: 2,
      metadata: {
        status: 'success',
        query: 'latest company update',
        sources: [
          expect.objectContaining({ id: 1, title: 'Source One', domain: 'example.com' }),
          expect.objectContaining({ id: 2, title: 'Source Two', domain: 'example.com' }),
        ],
      },
    });

    const assistantInsert = tracker.inserts('messages')[1]?.args as {
      content: string;
      search_metadata: {
        status: string;
        sources: Array<{ id: number; title: string; domain: string }>;
      };
    };
    expect(assistantInsert.content).toBe('Grounded answer [1]');
    expect(assistantInsert.search_metadata).toMatchObject({
      status: 'success',
      sources: [
        expect.objectContaining({ id: 1, title: 'Source One', domain: 'example.com' }),
        expect.objectContaining({ id: 2, title: 'Source Two', domain: 'example.com' }),
      ],
    });
    expect(mockProcessMemoryV2).toHaveBeenCalledWith(
      expect.anything(),
      'user-1',
      [{ role: 'user', content: 'What changed this week?' }],
      'Grounded answer',
      expect.objectContaining({
        conversationId: 'conv-1',
        sourceMessageId: 'msg-user-1',
      })
    );
    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining(
          'The current time is 2026-01-01 19:04 (America/Vancouver).'
        ),
      })
    );
    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining("The user's name is Test User."),
      })
    );
  });
});

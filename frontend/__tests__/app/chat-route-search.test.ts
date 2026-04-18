import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createMockSupabase } from '../helpers/mock-supabase';

const mockAfter = vi.fn((callback: () => unknown) => callback());
const mockGenerateText = vi.fn();
const mockGenerateObject = vi.fn();
const mockStreamText = vi.fn();
const mockCreateSupabaseServerClient = vi.fn();
const mockLoadMemoryContextV2 = vi.fn();
const mockProcessMemoryV2 = vi.fn();
const mockBuildMentorPrompt = vi.fn();
const mockRunSearchPipeline = vi.fn();

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  return {
    ...actual,
    after: (callback: () => unknown) => mockAfter(callback),
  };
});

function toSseLine(part: Record<string, unknown>) {
  return `data: ${JSON.stringify(part)}\n\n`;
}

function createMockUIMessageStream({
  execute,
}: {
  execute: (params: {
    writer: {
      write: (part: Record<string, unknown>) => void;
      merge: (_stream: unknown) => void;
    };
  }) => Promise<void> | void;
}) {
  return new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const pendingMerges: Promise<unknown>[] = [];
      const writer = {
        write: (part: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(toSseLine(part)));
        },
        merge: (stream: unknown) => {
          if (
            stream
            && typeof stream === 'object'
            && '__pending' in stream
            && stream.__pending instanceof Promise
          ) {
            pendingMerges.push(stream.__pending);
          }
        },
      };

      await execute({ writer });
      await Promise.all(pendingMerges);
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
}

async function readMockChatResponse(response: Response) {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('text/event-stream')) {
    const body = await response.text();
    let metadata: Record<string, unknown> = {};

    for (const line of body.split('\n')) {
      if (!line.startsWith('data: ')) continue;
      const payload = line.slice(6).trim();
      if (!payload || payload === '[DONE]') continue;

      const event = JSON.parse(payload) as Record<string, unknown>;
      if (event.type === 'data-chatMeta' && event.data) {
        metadata = event.data as Record<string, unknown>;
      }
    }

    return metadata;
  }

  return response.json() as Promise<Record<string, unknown>>;
}

vi.mock('ai', () => ({
  generateText: (...args: unknown[]) => mockGenerateText(...args),
  generateObject: (...args: unknown[]) => mockGenerateObject(...args),
  streamText: (...args: unknown[]) => mockStreamText(...args),
  createUIMessageStream: ({
    execute,
  }: {
    execute: (params: { writer: { write: (part: Record<string, unknown>) => void; merge: (_stream: unknown) => void } }) => Promise<void> | void;
  }) => createMockUIMessageStream({ execute }),
  createUIMessageStreamResponse: ({ stream }: { stream: ReadableStream }) => {
    return new Response(stream, {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    });
  },
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

vi.mock('@/lib/search/pipeline', () => ({
  runSearchPipeline: (...args: unknown[]) => mockRunSearchPipeline(...args),
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
  const json = await readMockChatResponse(response);

  return { response, body: json, tracker };
}

describe('chat route search citations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStreamText.mockImplementation(({ onFinish }: { onFinish?: (result: { text: string }) => Promise<void> }) => {
      return {
        toUIMessageStream: () => ({
          __pending: onFinish?.({ text: 'Assistant reply' }) ?? Promise.resolve(),
        }),
      };
    });
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
    mockRunSearchPipeline.mockResolvedValue({
      status: 'success',
      profile: 'fresh_web',
      query: 'latest company update',
      providers: ['brave'],
      results: [
        {
          title: 'Source One',
          url: 'https://example.com/one',
          domain: 'example.com',
          snippet: 'First source snippet',
          provider: 'brave',
          sourceType: 'official',
          publishedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          title: 'Source Two',
          url: 'https://example.com/two',
          domain: 'example.com',
          snippet: 'Second source snippet',
          provider: 'brave',
          sourceType: 'news',
          publishedAt: null,
        },
      ],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('persists null search metadata when search mode is off', async () => {
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
    expect(mockRunSearchPipeline).not.toHaveBeenCalled();
    expect(mockGenerateObject).not.toHaveBeenCalled();

    const assistantInsert = tracker.inserts('messages')[1]?.args as {
      search_metadata?: unknown;
    };
    expect(assistantInsert.search_metadata).toBeNull();
  });

  it('persists normalized search metadata and strips invalid citations for required mode', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-02T03:04:05.000Z'));
    mockStreamText.mockImplementation(({ onFinish }: { onFinish?: (result: { text: string }) => Promise<void> }) => {
      return {
        toUIMessageStream: () => ({
          __pending: onFinish?.({ text: 'Grounded answer [1] [9]' }) ?? Promise.resolve(),
        }),
      };
    });
    mockGenerateText.mockResolvedValue({ text: 'Grounded Title' });

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
        version: 2,
        profile: 'fresh_web',
        status: 'success',
        query: 'latest company update',
        providers: ['brave'],
        sources: [
          expect.objectContaining({
            id: 1,
            title: 'Source One',
            domain: 'example.com',
            provider: 'brave',
            sourceType: 'official',
          }),
          expect.objectContaining({
            id: 2,
            title: 'Source Two',
            domain: 'example.com',
            provider: 'brave',
            sourceType: 'news',
          }),
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
      version: 2,
      profile: 'fresh_web',
      status: 'success',
      sources: [
        expect.objectContaining({
          id: 1,
          title: 'Source One',
          domain: 'example.com',
          provider: 'brave',
          sourceType: 'official',
        }),
        expect.objectContaining({
          id: 2,
          title: 'Source Two',
          domain: 'example.com',
          provider: 'brave',
          sourceType: 'news',
        }),
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
    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining(
          'The current time is 2026-01-01 19:04 (America/Vancouver).'
        ),
      })
    );
    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining("The user's name is Test User."),
      })
    );
    expect(mockGenerateObject).not.toHaveBeenCalled();
  });
});

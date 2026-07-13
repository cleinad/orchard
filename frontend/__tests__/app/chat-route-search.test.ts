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

async function readMockChatResponseDetails(response: Response) {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('text/event-stream')) {
    const body = await response.text();
    let metadata: Record<string, unknown> = {};
    const parts: Record<string, unknown>[] = [];

    for (const line of body.split('\n')) {
      if (!line.startsWith('data: ')) continue;
      const payload = line.slice(6).trim();
      if (!payload || payload === '[DONE]') continue;

      const event = JSON.parse(payload) as Record<string, unknown>;
      parts.push(event);
      if (event.type === 'data-chatMeta' && event.data) {
        metadata = event.data as Record<string, unknown>;
      }
    }

    return { metadata, parts };
  }

  return {
    metadata: await response.json() as Record<string, unknown>,
    parts: [],
  };
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
  getSearchPlannerModel: vi.fn(() => null),
  getSearchDecisionModelConfig: vi.fn(() => ({
    primary: null,
    fallback: null,
  })),
  SEARCH_PLANNER_MODEL_ID: 'qwen/qwen-2.5-7b-instruct',
  SEARCH_PLANNER_PROVIDER: 'openrouter',
  getChatModelProviderOptions: vi.fn(() => undefined),
  getNoChatModelConfiguredMessage: vi.fn(() => 'No chat model is configured.'),
  resolveChatModelSelection: vi.fn(() => ({
    id: 'gpt-5.4',
    requestedId: 'gpt-5.4',
    provider: 'openai',
    apiModelId: 'gpt-5.4',
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
  const { metadata, parts } = await readMockChatResponseDetails(response);

  return { response, body: metadata, parts, tracker };
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
          snippet: 'First source snippet about what changed this week in the company update.',
          provider: 'brave',
          sourceType: 'official',
          publishedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          title: 'Source Two',
          url: 'https://example.com/two',
          domain: 'example.com',
          snippet: 'Second source snippet about what changed this week in the company update.',
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
      { message: 'Help me brainstorm names', searchMode: 'off', timezone: 'America/Vancouver' },
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

  it('defaults missing search mode to off', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-02T03:04:05.000Z'));

    const { response, body, parts } = await runChatRequest(
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
      mode: 'off',
      attempted: false,
      status: 'not_attempted',
      metadata: null,
    });
    expect(mockRunSearchPipeline).not.toHaveBeenCalled();
    expect(parts.some((part) => part.type === 'data-searchActivity')).toBe(false);
  });

  it('keeps required no-result search visible but does not prepend failure disclosure', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-02T03:04:05.000Z'));
    mockRunSearchPipeline.mockResolvedValue({
      status: 'no_results',
      profile: 'fresh_web',
      query: 'obscure topic sources',
      providers: ['brave'],
      results: [],
    });
    mockStreamText.mockImplementation(({ onFinish }: { onFinish?: (result: { text: string }) => Promise<void> }) => {
      return {
        toUIMessageStream: () => ({
          __pending: onFinish?.({ text: 'Here is the best answer I can give.' }) ?? Promise.resolve(),
        }),
      };
    });

    const { response, body, parts } = await runChatRequest(
      {
        message: 'Search for obscure topic sources',
        searchMode: 'required',
        timezone: 'America/Vancouver',
      },
      {
        conversations: {
          rows: [],
          returnOnMutate: [{ id: 'conv-1' }],
        },
        messages: {
          rows: [{ role: 'user', content: 'Search for obscure topic sources', search_metadata: null }],
          returnOnMutate: [{ id: 'msg-user-1' }, { id: 'msg-assistant-1' }],
        },
      }
    );

    expect(response.status).toBe(200);
    expect(parts.some((part) => part.type === 'data-searchActivity')).toBe(true);
    expect(body.message).toBe('Here is the best answer I can give.');
    expect(body.message).not.toContain("Search mode didn't find useful sources");
    expect(body.search).toMatchObject({
      mode: 'required',
      attempted: true,
      status: 'no_results',
      metadata: {
        activity: expect.objectContaining({
          collapsedLabel: 'Search completed',
        }),
      },
    });
    expect(body.searchActivity).toMatchObject({
      collapsedLabel: 'Search completed',
    });
  });

  it('does not ground the reply on relevance-rejected required search results', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-02T03:04:05.000Z'));
    mockRunSearchPipeline.mockResolvedValue({
      status: 'success',
      profile: 'fresh_web',
      query: 'latest Iran ceasefire current status',
      providers: ['brave'],
      results: [
        {
          title: 'What About Now lyrics',
          url: 'https://lyrics.example.com/song',
          domain: 'lyrics.example.com',
          snippet: 'Lyrics and music video for a song.',
          provider: 'brave',
          sourceType: 'other',
          publishedAt: null,
        },
      ],
    });
    mockStreamText.mockImplementation(({ onFinish }: { onFinish?: (result: { text: string }) => Promise<void> }) => {
      return {
        toUIMessageStream: () => ({
          __pending: onFinish?.({ text: 'Here is an ungrounded answer.' }) ?? Promise.resolve(),
        }),
      };
    });

    const { response, body } = await runChatRequest({
      message: 'what about now?',
      searchMode: 'required',
      chatMode: 'temporary',
      timezone: 'America/Vancouver',
      history: [
        {
          role: 'user',
          content: 'what is happening in Iran? did the war end?',
        },
      ],
    });

    expect(response.status).toBe(200);
    expect(mockRunSearchPipeline).toHaveBeenCalledTimes(2);
    expect(body.search).toMatchObject({
      mode: 'required',
      attempted: true,
      status: 'no_results',
      metadata: {
        sources: [],
      },
    });
    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.not.stringContaining('Lyrics and music video for a song.'),
      })
    );
    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.not.stringContaining('<web_search_results'),
      })
    );
  });

  it('prepends unavailable disclosure for required thrown search failures', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-02T03:04:05.000Z'));
    mockRunSearchPipeline.mockRejectedValue(new Error('provider down'));
    mockStreamText.mockImplementation(({ onFinish }: { onFinish?: (result: { text: string }) => Promise<void> }) => {
      return {
        toUIMessageStream: () => ({
          __pending: onFinish?.({ text: 'General answer without source narration.' }) ?? Promise.resolve(),
        }),
      };
    });

    const { response, body, parts } = await runChatRequest(
      {
        message: 'Search the web for provider status',
        searchMode: 'required',
        chatMode: 'temporary',
        timezone: 'America/Vancouver',
      }
    );

    expect(response.status).toBe(200);
    expect(parts.some((part) => part.type === 'data-searchActivity')).toBe(true);
    expect(body.message).toBe(
      "Search mode is unavailable right now, so I'm answering without fresh web results.\n\nGeneral answer without source narration."
    );
    expect(body.search).toMatchObject({
      mode: 'required',
      attempted: true,
      status: 'upstream_error',
      metadata: {
        activity: expect.objectContaining({
          collapsedLabel: 'Search was unavailable for this reply',
        }),
      },
    });
    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.not.stringContaining('Live web search is unavailable'),
      })
    );
  });

  it('keeps thrown auto search failures invisible to the user but logs internally', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-02T03:04:05.000Z'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockRunSearchPipeline.mockRejectedValue(new Error('provider down'));
    mockStreamText.mockImplementation(({ onFinish }: { onFinish?: (result: { text: string }) => Promise<void> }) => {
      return {
        toUIMessageStream: () => ({
          __pending: onFinish?.({ text: 'General answer without source narration.' }) ?? Promise.resolve(),
        }),
      };
    });

    const { response, body, parts } = await runChatRequest(
      {
        message: 'Search the web for provider status',
        searchMode: 'auto',
        chatMode: 'temporary',
        timezone: 'America/Vancouver',
      }
    );

    expect(response.status).toBe(200);
    expect(parts.some((part) => part.type === 'data-searchActivity')).toBe(false);
    expect(body.message).toBe('General answer without source narration.');
    expect(body.search).toMatchObject({
      mode: 'auto',
      attempted: false,
      status: 'not_attempted',
      metadata: null,
    });
    expect(warnSpy).toHaveBeenCalledWith(
      '[chat] auto search failed invisibly',
      expect.objectContaining({
        searchMode: 'auto',
        latestMessagePreview: 'Search the web for provider status',
        error: 'provider down',
      })
    );

    warnSpy.mockRestore();
  });

  it('keeps non-throwing auto provider failures invisible to the user but logs internally', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-02T03:04:05.000Z'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockRunSearchPipeline.mockResolvedValue({
      status: 'upstream_error',
      profile: 'fresh_web',
      query: 'provider status',
      providers: ['brave'],
      results: [],
      error: 'provider returned upstream_error',
    });
    mockStreamText.mockImplementation(({ onFinish }: { onFinish?: (result: { text: string }) => Promise<void> }) => {
      return {
        toUIMessageStream: () => ({
          __pending: onFinish?.({ text: 'General answer after provider failure.' }) ?? Promise.resolve(),
        }),
      };
    });

    const { response, body, parts } = await runChatRequest(
      {
        message: 'Search the web for provider status',
        searchMode: 'auto',
        chatMode: 'temporary',
        timezone: 'America/Vancouver',
      }
    );

    expect(response.status).toBe(200);
    expect(parts.some((part) => part.type === 'data-searchActivity')).toBe(false);
    expect(body.message).toBe('General answer after provider failure.');
    expect(body.search).toMatchObject({
      mode: 'auto',
      attempted: false,
      status: 'not_attempted',
      metadata: null,
    });
    expect(warnSpy).toHaveBeenCalledWith(
      '[chat] auto search failed invisibly',
      expect.objectContaining({
        searchMode: 'auto',
        latestMessagePreview: 'Search the web for provider status',
        error: 'upstream_error',
      })
    );

    warnSpy.mockRestore();
  });

  it('prepends unavailable disclosure for non-throwing provider failures', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-02T03:04:05.000Z'));
    mockRunSearchPipeline.mockResolvedValue({
      status: 'upstream_error',
      profile: 'fresh_web',
      query: 'provider status',
      providers: ['brave'],
      results: [],
      error: 'provider returned upstream_error',
    });
    mockStreamText.mockImplementation(({ onFinish }: { onFinish?: (result: { text: string }) => Promise<void> }) => {
      return {
        toUIMessageStream: () => ({
          __pending: onFinish?.({ text: 'General answer after provider failure.' }) ?? Promise.resolve(),
        }),
      };
    });

    const { response, body, parts } = await runChatRequest(
      {
        message: 'Search the web for provider status',
        searchMode: 'required',
        chatMode: 'temporary',
        timezone: 'America/Vancouver',
      }
    );

    expect(response.status).toBe(200);
    expect(parts.some((part) => part.type === 'data-searchActivity')).toBe(true);
    expect(body.message).toBe(
      "Search mode is unavailable right now, so I'm answering without fresh web results.\n\nGeneral answer after provider failure."
    );
    expect(body.search).toMatchObject({
      mode: 'required',
      attempted: true,
      status: 'upstream_error',
      metadata: {
        activity: expect.objectContaining({
          collapsedLabel: 'Search completed',
        }),
      },
    });
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
      mode: 'required',
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
    const systemPrompt = mockStreamText.mock.calls.at(-1)?.[0]?.system as string;
    expect(systemPrompt).toContain('<web_search_results');
    expect(systemPrompt).toContain('Length: Brief');
    expect(systemPrompt).not.toContain('2 to 4 sentences');
    expect(mockGenerateObject).not.toHaveBeenCalled();
  });

  it('searches resolved contextual follow-up queries and records the final query', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-16T12:00:00.000Z'));
    mockRunSearchPipeline.mockImplementationOnce(async (query: string) => ({
      status: 'success',
      profile: 'fresh_web',
      query,
      providers: ['brave'],
      results: [
        {
          title: 'Iran war ceasefire talks continue',
          url: 'https://example.com/iran-war-ceasefire',
          domain: 'example.com',
          snippet: 'Latest current status on Iran war ceasefire negotiations.',
          provider: 'brave',
          sourceType: 'news',
          publishedAt: '2026-06-16T00:00:00.000Z',
        },
      ],
    }));

    const { response, body } = await runChatRequest({
      message: 'what about now?',
      searchEnabled: true,
      chatMode: 'temporary',
      timezone: 'America/Vancouver',
      history: [
        {
          role: 'user',
          content: 'what is happening in Iran? did the war end?',
        },
        {
          role: 'assistant',
          content: 'I do not have live search enabled for that.',
        },
      ],
    });

    const plannedQuery = mockRunSearchPipeline.mock.calls[0]?.[0];

    expect(response.status).toBe(200);
    expect(plannedQuery).toContain('Iran war');
    expect(plannedQuery).toContain('ceasefire');
    expect(plannedQuery).not.toBe('what about now?');
    expect(body.search).toMatchObject({
      attempted: true,
      status: 'success',
      metadata: {
        query: plannedQuery,
        sources: [
          expect.objectContaining({
            title: 'Iran war ceasefire talks continue',
          }),
        ],
      },
    });
  });

  it('plans today follow-up searches using the user timezone date', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-17T01:00:00.000Z'));
    mockRunSearchPipeline.mockImplementationOnce(async (query: string) => ({
      status: 'success',
      profile: 'fresh_web',
      query,
      providers: ['brave'],
      results: [
        {
          title: 'OpenAI model release updates',
          url: 'https://example.com/openai-model-release',
          domain: 'example.com',
          snippet: 'Latest updates on the OpenAI model release.',
          provider: 'brave',
          sourceType: 'news',
          publishedAt: '2026-06-16T23:00:00.000Z',
        },
      ],
    }));

    const { response } = await runChatRequest({
      message: 'what happened today?',
      searchEnabled: true,
      chatMode: 'temporary',
      timezone: 'America/Vancouver',
      history: [
        {
          role: 'user',
          content: 'Can you track the OpenAI model release?',
        },
      ],
    });

    expect(response.status).toBe(200);
    expect(mockRunSearchPipeline.mock.calls[0]?.[0]).toBe(
      'today 2026-06-16 track OpenAI model release latest updates'
    );
  });
});

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
const mockRunWebSearch = vi.fn();

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
    id: 'gpt-5-mini',
    provider: 'openai',
  })),
}));

vi.mock('@/lib/tools', () => ({
  runWebSearch: (...args: unknown[]) => mockRunWebSearch(...args),
  webSearch: {},
}));

vi.mock('@/lib/mentors/prompts', () => ({
  buildMentorPrompt: (...args: unknown[]) => mockBuildMentorPrompt(...args),
}));

function createAuthenticatedSupabase(tables: Record<string, { rows: object[]; returnOnMutate?: object[] }> = {}) {
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

  return { response, body: json, supabase, tracker };
}

describe('chat route memory contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // streamText now drives the main reply generation; onFinish is awaited by the mocked UI stream.
    mockStreamText.mockImplementation(({ onFinish }: { onFinish?: (result: { text: string }) => Promise<void> }) => {
      return {
        toUIMessageStream: () => ({
          __pending: onFinish?.({ text: 'Assistant reply' }) ?? Promise.resolve(),
        }),
      };
    });
    // generateText is still used for search planning and title generation
    mockGenerateText.mockResolvedValue({ text: 'Test Title' });
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
      query: 'Hello',
      results: [
        {
          title: 'Example',
          url: 'https://example.com/article',
          snippet: 'Example snippet',
        },
      ],
    });
    delete process.env.TAVILY_API_KEY;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('passes the authenticated Supabase client into processMemoryV2', async () => {
    const { response, body, supabase } = await runChatRequest(
      { message: 'Hello' },
      {
        conversations: {
          rows: [],
          returnOnMutate: [{ id: 'conv-1' }],
        },
        messages: {
          rows: [{ role: 'user', content: 'Hello' }],
          returnOnMutate: [{ id: 'msg-user-1' }, { id: 'msg-assistant-1' }],
        },
      }
    );

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

  it('does not schedule background memory extraction for temporary chats', async () => {
    const { response } = await runChatRequest({
      message: 'Hello',
      chatMode: 'temporary',
    });

    expect(response.status).toBe(200);
    expect(mockAfter).not.toHaveBeenCalled();
    expect(mockProcessMemoryV2).not.toHaveBeenCalled();
  });

  it('loads existing memory for temporary chats when memoryMode is use_existing', async () => {
    const { response, supabase } = await runChatRequest({
      message: 'Hello',
      chatMode: 'temporary',
      memoryMode: 'use_existing',
    });

    expect(response.status).toBe(200);
    expect(mockLoadMemoryContextV2).toHaveBeenCalledTimes(1);
    expect(mockLoadMemoryContextV2).toHaveBeenCalledWith(
      supabase,
      'user-1',
      expect.objectContaining({
        actor: 'default',
        query: 'Hello',
      })
    );
    expect(mockProcessMemoryV2).not.toHaveBeenCalled();
  });

  it('skips memory loading for temporary chats when memoryMode is off', async () => {
    const { response } = await runChatRequest({
      message: 'Hello',
      chatMode: 'temporary',
      memoryMode: 'off',
    });

    expect(response.status).toBe(200);
    expect(mockLoadMemoryContextV2).not.toHaveBeenCalled();
    expect(mockProcessMemoryV2).not.toHaveBeenCalled();
  });

  it('passes mentor actor and mentorId into memory read/write paths', async () => {
    const { response, supabase } = await runChatRequest(
      {
        message: 'Help me study calculus',
        mentorId: 'mentor-1',
      },
      {
        mentors: {
          rows: [
            {
              id: 'mentor-1',
              base_system_prompt: 'Mentor prompt',
              user_instructions: '',
              model_id: null,
            },
          ],
        },
        conversations: {
          rows: [],
          returnOnMutate: [{ id: 'conv-mentor-1' }],
        },
        messages: {
          rows: [{ role: 'user', content: 'Help me study calculus' }],
          returnOnMutate: [
            { id: 'msg-user-mentor-1' },
            { id: 'msg-assistant-mentor-1' },
          ],
        },
      }
    );

    expect(response.status).toBe(200);
    expect(mockLoadMemoryContextV2).toHaveBeenCalledWith(
      supabase,
      'user-1',
      expect.objectContaining({
        actor: 'mentor',
        mentorId: 'mentor-1',
        query: 'Help me study calculus',
      })
    );
    expect(mockProcessMemoryV2).toHaveBeenCalledWith(
      supabase,
      'user-1',
      [{ role: 'user', content: 'Help me study calculus' }],
      'Assistant reply',
      expect.objectContaining({
        conversationId: 'conv-mentor-1',
        mentorId: 'mentor-1',
        sourceMessageId: 'msg-user-mentor-1',
      })
    );
  });

  it('injects current UTC time and profile name into normal answer generation', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-02T03:04:05.000Z'));

    const { response } = await runChatRequest({
      message: 'What time is it right now?',
      chatMode: 'temporary',
      timezone: 'America/Vancouver',
    });

    expect(response.status).toBe(200);
    // streamText now handles generation; check its system prompt
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
  });

  it('retries with generateText when the streamed response is empty', async () => {
    mockStreamText.mockImplementation(({ onFinish }: { onFinish?: (result: { text: string }) => Promise<void> }) => {
      return {
        toUIMessageStream: () => ({
          __pending: onFinish?.({ text: '   ' }) ?? Promise.resolve(),
        }),
      };
    });
    mockGenerateText.mockResolvedValue({ text: 'Recovered reply' });

    const { response, body } = await runChatRequest({
      message: 'Hello',
      chatMode: 'temporary',
    });

    expect(response.status).toBe(200);
    expect(body.message).toBe('Recovered reply');
    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining('Do not return an empty response.'),
      })
    );
  });
});

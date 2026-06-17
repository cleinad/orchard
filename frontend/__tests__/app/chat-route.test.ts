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
const mockStorageDownload = vi.fn();
const mockStorageRemove = vi.fn();
const mockResolveChatModelSelection = vi.fn((_modelId?: string | null) => ({
  id: 'gpt-5-mini',
  label: 'GPT 5 Mini',
  provider: 'openai',
  apiModelId: 'gpt-5-mini',
  supportsImages: true,
}));
const testPngBytes = new Uint8Array([
  0x89,
  0x50,
  0x4e,
  0x47,
  0x0d,
  0x0a,
  0x1a,
  0x0a,
]);

type TestMutationOperation = 'insert' | 'update' | 'upsert' | 'delete';

type TestTableConfig = {
  rows: object[];
  returnOnMutate?: object[];
  mutateError?: unknown | ((operation: TestMutationOperation, args: unknown) => unknown);
};

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
  resolveChatModelSelection: (modelId?: string | null) =>
    mockResolveChatModelSelection(modelId),
}));

vi.mock('@/lib/search/pipeline', () => ({
  runSearchPipeline: (...args: unknown[]) => mockRunSearchPipeline(...args),
}));

vi.mock('@/lib/mentors/prompts', () => ({
  buildMentorPrompt: (...args: unknown[]) => mockBuildMentorPrompt(...args),
}));

function createAuthenticatedSupabase(tables: Record<string, TestTableConfig> = {}) {
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
    storage: {
      from: vi.fn(() => ({
        download: (...args: unknown[]) => mockStorageDownload(...args),
        remove: (...args: unknown[]) => mockStorageRemove(...args),
      })),
    },
  };

  return { supabase, tracker };
}

async function runChatRequest(
  body: Record<string, unknown>,
  tables: Record<string, TestTableConfig> = {}
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
    mockRunSearchPipeline.mockResolvedValue({
      status: 'success',
      profile: 'fresh_web',
      query: 'Hello',
      providers: ['brave'],
      results: [
        {
          title: 'Example',
          url: 'https://example.com/article',
          snippet: 'Example snippet',
          domain: 'example.com',
          provider: 'brave',
          sourceType: 'official',
          publishedAt: null,
        },
      ],
    });
    mockStorageDownload.mockResolvedValue({
      data: new Blob([testPngBytes], { type: 'image/png' }),
      error: null,
    });
    mockStorageRemove.mockResolvedValue({ data: null, error: null });
    mockResolveChatModelSelection.mockReturnValue({
      id: 'gpt-5-mini',
      label: 'GPT 5 Mini',
      provider: 'openai',
      apiModelId: 'gpt-5-mini',
      supportsImages: true,
    });
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

  it('generates a title for empty existing first-message conversations', async () => {
    const { response, body, tracker } = await runChatRequest(
      {
        message: 'Help me plan a launch',
        conversationId: 'conv-precreated-1',
      },
      {
        conversations: {
          rows: [{ id: 'conv-precreated-1', mentor_id: null }],
        },
        messages: {
          rows: [],
          returnOnMutate: [{ id: 'msg-user-1' }, { id: 'msg-assistant-1' }],
        },
      }
    );

    expect(response.status).toBe(200);
    expect(body.conversationId).toBe('conv-precreated-1');
    expect(body.conversationTitle).toBe('Help me plan a launch');
    expect(tracker.updates('conversations')[0].args).toEqual({ title: 'Test Title' });
  });

  it('does not retitle existing conversations that already have messages', async () => {
    const { response, body, tracker } = await runChatRequest(
      {
        message: 'Continue the plan',
        conversationId: 'conv-existing-1',
      },
      {
        conversations: {
          rows: [{ id: 'conv-existing-1', mentor_id: null }],
        },
        messages: {
          rows: [
            {
              id: 'msg-existing-1',
              role: 'user',
              content: 'Earlier message',
              previous_message_id: null,
              created_at: '2026-06-04T12:00:00.000Z',
            },
          ],
          returnOnMutate: [{ id: 'msg-user-2' }, { id: 'msg-assistant-2' }],
        },
      }
    );

    expect(response.status).toBe(200);
    expect(body.conversationId).toBe('conv-existing-1');
    expect(body.conversationTitle).toBeNull();
    expect(tracker.updates('conversations')).toHaveLength(0);
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

  it('rejects invalid persistent thread source ids before creating a thread', async () => {
    const { response, body, tracker } = await runChatRequest(
      {
        message: 'Explain this',
        conversationId: '11111111-1111-4111-8111-111111111111',
        sourceMessageId: 'streaming-1780862329520',
        highlightedText: 'selected text',
        startOffset: 0,
        endOffset: 13,
      },
      {
        conversations: {
          rows: [{ id: '11111111-1111-4111-8111-111111111111', mentor_id: null }],
        },
      }
    );

    expect(response.status).toBe(400);
    expect(body.error).toBe('Invalid source message id');
    expect(tracker.inserts('threads')).toHaveLength(0);
    expect(mockStreamText).not.toHaveBeenCalled();
  });

  it('rejects invalid persistent previous message ids before saving a message', async () => {
    const { response, body, tracker } = await runChatRequest(
      {
        message: 'Continue',
        conversationId: '11111111-1111-4111-8111-111111111111',
        previousMessageId: 'streaming-1780862329520',
      },
      {
        conversations: {
          rows: [{ id: '11111111-1111-4111-8111-111111111111', mentor_id: null }],
        },
      }
    );

    expect(response.status).toBe(400);
    expect(body.error).toBe('Invalid previous message id');
    expect(tracker.inserts('messages')).toHaveLength(0);
    expect(mockStreamText).not.toHaveBeenCalled();
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

  it('adds concise KaTeX markdown math formatting guidance to answer generation', async () => {
    const { response } = await runChatRequest({
      message: 'Show me a matrix example',
      chatMode: 'temporary',
    });

    expect(response.status).toBe(200);
    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining('Use KaTeX Markdown for math'),
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

  it('rejects more than five image attachments', async () => {
    const attachments = Array.from({ length: 6 }, (_, index) => ({
      storagePath: `user-1/image-${index}.png`,
      fileName: `image-${index}.png`,
      mimeType: 'image/png',
      sizeBytes: testPngBytes.byteLength,
    }));

    const { response, body } = await runChatRequest({
      message: 'Read these',
      chatMode: 'temporary',
      attachments,
    });

    expect(response.status).toBe(400);
    expect(body.error).toBe('Attach up to 5 images at a time');
    expect(mockStorageDownload).not.toHaveBeenCalled();
  });

  it('sends the latest user image attachments as model image parts', async () => {
    const { response } = await runChatRequest({
      message: 'What does this screenshot say?',
      chatMode: 'temporary',
      attachments: [
        {
          storagePath: 'user-1/screenshot.png',
          fileName: 'screenshot.png',
          mimeType: 'image/png',
          sizeBytes: testPngBytes.byteLength,
          width: 640,
          height: 480,
        },
      ],
    });

    expect(response.status).toBe(200);
    expect(mockStorageDownload).toHaveBeenCalledWith('user-1/screenshot.png');
    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          expect.objectContaining({
            role: 'user',
            content: [
              { type: 'text', text: 'What does this screenshot say?' },
              expect.objectContaining({
                type: 'image',
                mediaType: 'image/png',
                image: expect.any(Uint8Array),
              }),
            ],
          }),
        ],
      })
    );
  });

  it('reattaches the latest temporary chat image turn for text-only follow-ups', async () => {
    const { response } = await runChatRequest({
      message: 'What color is the main object?',
      chatMode: 'temporary',
      history: [
        {
          role: 'user',
          content: 'Describe this image',
          attachments: [
            {
              storagePath: 'user-1/previous-screenshot.png',
              fileName: 'previous-screenshot.png',
              mimeType: 'image/png',
              sizeBytes: testPngBytes.byteLength,
            },
          ],
        },
        {
          role: 'assistant',
          content: 'It shows a product screenshot.',
        },
      ],
    });

    expect(response.status).toBe(200);
    expect(mockStorageDownload).toHaveBeenCalledWith('user-1/previous-screenshot.png');
    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          expect.objectContaining({
            role: 'user',
            content: [
              { type: 'text', text: 'Describe this image' },
              expect.objectContaining({
                type: 'image',
                mediaType: 'image/png',
                image: expect.any(Uint8Array),
              }),
            ],
          }),
          expect.objectContaining({
            role: 'assistant',
            content: 'It shows a product screenshot.',
          }),
          expect.objectContaining({
            role: 'user',
            content: 'What color is the main object?',
          }),
        ],
      })
    );
  });

  it('reattaches the latest persistent chat image turn for text-only follow-ups', async () => {
    const { response } = await runChatRequest(
      {
        message: 'What color is the main object?',
        conversationId: 'conv-existing-image-context',
        previousMessageId: '22222222-2222-4222-8222-222222222222',
      },
      {
        conversations: {
          rows: [{ id: 'conv-existing-image-context', mentor_id: null }],
        },
        messages: {
          rows: [
            {
              id: '11111111-1111-4111-8111-111111111111',
              role: 'user',
              content: 'Describe this image',
              previous_message_id: null,
              created_at: '2026-06-04T12:00:00.000Z',
            },
            {
              id: '22222222-2222-4222-8222-222222222222',
              role: 'assistant',
              content: 'It shows a product screenshot.',
              previous_message_id: '11111111-1111-4111-8111-111111111111',
              created_at: '2026-06-04T12:00:01.000Z',
            },
            {
              id: '33333333-3333-4333-8333-333333333333',
              role: 'user',
              content: 'What color is the main object?',
              previous_message_id: '22222222-2222-4222-8222-222222222222',
              created_at: '2026-06-04T12:00:02.000Z',
            },
          ],
          returnOnMutate: [
            { id: '33333333-3333-4333-8333-333333333333' },
            { id: '44444444-4444-4444-8444-444444444444' },
          ],
        },
        message_attachments: {
          rows: [
            {
              message_id: '11111111-1111-4111-8111-111111111111',
              user_id: 'user-1',
              storage_path: 'user-1/persisted-screenshot.png',
              file_name: 'persisted-screenshot.png',
              mime_type: 'image/png',
              size_bytes: testPngBytes.byteLength,
              width: 640,
              height: 480,
              position: 0,
            },
          ],
        },
      }
    );

    expect(response.status).toBe(200);
    expect(mockStorageDownload).toHaveBeenCalledWith('user-1/persisted-screenshot.png');
    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          expect.objectContaining({
            role: 'user',
            content: [
              { type: 'text', text: 'Describe this image' },
              expect.objectContaining({
                type: 'image',
                mediaType: 'image/png',
                image: expect.any(Uint8Array),
              }),
            ],
          }),
          expect.objectContaining({
            role: 'assistant',
            content: 'It shows a product screenshot.',
          }),
          expect.objectContaining({
            role: 'user',
            content: 'What color is the main object?',
          }),
        ],
      })
    );
  });

  it('rejects image attachments when the resolved model cannot read images', async () => {
    mockResolveChatModelSelection.mockReturnValue({
      id: 'gpt-5-mini',
      label: 'Text Model',
      provider: 'openai',
      apiModelId: 'gpt-5-mini',
      supportsImages: false,
    });

    const { response, body } = await runChatRequest({
      message: 'Read this',
      chatMode: 'temporary',
      attachments: [
        {
          storagePath: 'user-1/image.png',
          fileName: 'image.png',
          mimeType: 'image/png',
          sizeBytes: testPngBytes.byteLength,
        },
      ],
    });

    expect(response.status).toBe(400);
    expect(body.error).toBe('Text Model cannot read images. Choose a vision-capable model.');
    expect(mockStorageDownload).not.toHaveBeenCalled();
    expect(mockStreamText).not.toHaveBeenCalled();
  });

  it('rejects image attachments when stored bytes do not match client metadata', async () => {
    const { response, body } = await runChatRequest({
      message: 'Read this',
      chatMode: 'temporary',
      attachments: [
        {
          storagePath: 'user-1/image.png',
          fileName: 'image.png',
          mimeType: 'image/png',
          sizeBytes: testPngBytes.byteLength + 1,
        },
      ],
    });

    expect(response.status).toBe(400);
    expect(body.error).toBe('Image upload metadata did not match the stored image');
    expect(mockStreamText).not.toHaveBeenCalled();
  });

  it('keeps image-only turns attached to the current prompt in existing conversations', async () => {
    const { response } = await runChatRequest(
      {
        message: '',
        conversationId: 'conv-existing-image-only',
        attachments: [
          {
            storagePath: 'user-1/image-only.png',
            fileName: 'image-only.png',
            mimeType: 'image/png',
            sizeBytes: testPngBytes.byteLength,
          },
        ],
      },
      {
        conversations: {
          rows: [{ id: 'conv-existing-image-only', mentor_id: null }],
        },
        messages: {
          rows: [
            {
              id: 'msg-user-previous',
              role: 'user',
              content: 'Earlier prompt',
              previous_message_id: null,
              created_at: '2026-06-04T12:00:00.000Z',
            },
            {
              id: 'msg-assistant-previous',
              role: 'assistant',
              content: 'Earlier reply',
              previous_message_id: 'msg-user-previous',
              created_at: '2026-06-04T12:00:01.000Z',
            },
            {
              id: 'msg-user-image-only',
              role: 'user',
              content: '',
              previous_message_id: 'msg-assistant-previous',
              created_at: '2026-06-04T12:00:02.000Z',
            },
          ],
          returnOnMutate: [{ id: 'msg-user-image-only' }, { id: 'msg-assistant-image-only' }],
        },
      }
    );

    expect(response.status).toBe(200);
    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          expect.objectContaining({
            role: 'user',
            content: 'Earlier prompt',
          }),
          expect.objectContaining({
            role: 'assistant',
            content: 'Earlier reply',
          }),
          expect.objectContaining({
            role: 'user',
            content: [
              { type: 'text', text: 'Please answer based on the attached image.' },
              expect.objectContaining({
                type: 'image',
                mediaType: 'image/png',
              }),
            ],
          }),
        ],
      })
    );
  });

  it('persists image attachment metadata for persistent user messages', async () => {
    const { response, tracker } = await runChatRequest(
      {
        message: 'Describe this image',
        attachments: [
          {
            storagePath: 'user-1/photo.png',
            fileName: 'photo.png',
            mimeType: 'image/png',
            sizeBytes: testPngBytes.byteLength,
            width: 800,
            height: 600,
          },
        ],
      },
      {
        conversations: {
          rows: [],
          returnOnMutate: [{ id: 'conv-image-1' }],
        },
        messages: {
          rows: [],
          returnOnMutate: [{ id: 'msg-user-image-1' }, { id: 'msg-assistant-image-1' }],
        },
      }
    );

    expect(response.status).toBe(200);
    expect(tracker.inserts('message_attachments')[0].args).toEqual([
      expect.objectContaining({
        message_id: 'msg-user-image-1',
        user_id: 'user-1',
        storage_bucket: 'chat-images',
        storage_path: 'user-1/photo.png',
        file_name: 'photo.png',
        mime_type: 'image/png',
        size_bytes: testPngBytes.byteLength,
        width: 800,
        height: 600,
        position: 0,
      }),
    ]);
  });

  it('rolls back the user message and deletes unreferenced new uploads when attachment persistence fails', async () => {
    const { response, body, tracker } = await runChatRequest(
      {
        message: 'Describe this image',
        attachments: [
          {
            storagePath: 'user-1/photo.png',
            fileName: 'photo.png',
            mimeType: 'image/png',
            sizeBytes: testPngBytes.byteLength,
            width: 800,
            height: 600,
            cleanupOnFailure: true,
          },
        ],
      },
      {
        conversations: {
          rows: [],
          returnOnMutate: [{ id: 'conv-image-rollback' }],
        },
        messages: {
          rows: [],
          returnOnMutate: [{ id: 'msg-user-image-rollback' }],
        },
        message_attachments: {
          rows: [],
          mutateError: (operation: TestMutationOperation) =>
            operation === 'insert' ? { message: 'insert failed' } : null,
        },
      }
    );

    expect(response.status).toBe(500);
    expect(body.error).toBe('Failed to save image attachments');
    expect(tracker.deletes('message_attachments')[0].filters).toEqual({
      'eq:message_id': 'msg-user-image-rollback',
      'eq:user_id': 'user-1',
    });
    expect(tracker.deletes('messages')[0].filters).toEqual({
      'eq:id': 'msg-user-image-rollback',
      'eq:user_id': 'user-1',
    });
    expect(mockStorageRemove).toHaveBeenCalledWith(['user-1/photo.png']);
  });

  it('does not delete new-upload cleanup paths that are already referenced when attachment persistence fails', async () => {
    const { response, body, tracker } = await runChatRequest(
      {
        message: 'Describe this image',
        attachments: [
          {
            storagePath: 'user-1/photo.png',
            fileName: 'photo.png',
            mimeType: 'image/png',
            sizeBytes: testPngBytes.byteLength,
            width: 800,
            height: 600,
            cleanupOnFailure: true,
          },
        ],
      },
      {
        conversations: {
          rows: [],
          returnOnMutate: [{ id: 'conv-image-referenced-rollback' }],
        },
        messages: {
          rows: [],
          returnOnMutate: [{ id: 'msg-user-image-referenced-rollback' }],
        },
        message_attachments: {
          rows: [
            {
              storage_path: 'user-1/photo.png',
            },
          ],
          mutateError: (operation: TestMutationOperation) =>
            operation === 'insert' ? { message: 'duplicate key' } : null,
        },
      }
    );

    expect(response.status).toBe(500);
    expect(body.error).toBe('Failed to save image attachments');
    expect(tracker.deletes('message_attachments')[0].filters).toEqual({
      'eq:message_id': 'msg-user-image-referenced-rollback',
      'eq:user_id': 'user-1',
    });
    expect(tracker.deletes('messages')[0].filters).toEqual({
      'eq:id': 'msg-user-image-referenced-rollback',
      'eq:user_id': 'user-1',
    });
    expect(mockStorageRemove).not.toHaveBeenCalled();
  });

  it('rolls back the user message without deleting reused context images when attachment persistence fails', async () => {
    const { response, body, tracker } = await runChatRequest(
      {
        message: 'Describe this image again',
        attachments: [
          {
            storagePath: 'user-1/photo.png',
            fileName: 'photo.png',
            mimeType: 'image/png',
            sizeBytes: testPngBytes.byteLength,
            width: 800,
            height: 600,
          },
        ],
      },
      {
        conversations: {
          rows: [],
          returnOnMutate: [{ id: 'conv-image-context-rollback' }],
        },
        messages: {
          rows: [],
          returnOnMutate: [{ id: 'msg-user-image-context-rollback' }],
        },
        message_attachments: {
          rows: [
            {
              storage_path: 'user-1/photo.png',
            },
          ],
          mutateError: (operation: TestMutationOperation) =>
            operation === 'insert' ? { message: 'duplicate key' } : null,
        },
      }
    );

    expect(response.status).toBe(500);
    expect(body.error).toBe('Failed to save image attachments');
    expect(tracker.deletes('message_attachments')[0].filters).toEqual({
      'eq:message_id': 'msg-user-image-context-rollback',
      'eq:user_id': 'user-1',
    });
    expect(tracker.deletes('messages')[0].filters).toEqual({
      'eq:id': 'msg-user-image-context-rollback',
      'eq:user_id': 'user-1',
    });
    expect(mockStorageRemove).not.toHaveBeenCalled();
  });
});

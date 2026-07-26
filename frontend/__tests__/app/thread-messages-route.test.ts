import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createMockSupabase } from '../helpers/mock-supabase';

const mockCreateSupabaseServerClient = vi.fn();

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: () => mockCreateSupabaseServerClient(),
}));

function createAuthenticatedSupabase(tables: Record<string, { rows: object[] }>) {
  const { client, tracker } = createMockSupabase({ tables });
  return {
    supabase: {
      ...client,
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-1' } },
          error: null,
        }),
      },
    },
    tracker,
  };
}

describe('thread messages route', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns authoritative marker metadata with the thread messages', async () => {
    const threadId = '10000000-0000-4000-8000-000000000001';
    const conversationId = '20000000-0000-4000-8000-000000000001';
    const sourceMessageId = '30000000-0000-4000-8000-000000000001';
    const { supabase, tracker } = createAuthenticatedSupabase({
      threads: {
        rows: [{
          id: threadId,
          conversation_id: conversationId,
          source_message_id: sourceMessageId,
          highlighted_text: 'microtasks run before paint',
          start_offset: 12,
          end_offset: 39,
          selection_stream_version: 'v2',
          user_id: 'user-1',
        }],
      },
      messages: {
        rows: [{
          id: '40000000-0000-4000-8000-000000000001',
          role: 'assistant',
          content: 'They drain before rendering.',
          created_at: '2026-07-20T12:00:00.000Z',
          search_metadata: null,
          thread_id: threadId,
        }],
      },
    });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const { GET } = await import('@/app/api/threads/[threadId]/messages/route');
    const response = await GET(
      new NextRequest(`http://localhost/api/threads/${threadId}/messages`),
      { params: Promise.resolve({ threadId }) }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      thread: {
        threadId,
        conversationId,
        sourceMessageId,
        highlightedText: 'microtasks run before paint',
        startOffset: 12,
        endOffset: 39,
        selectionStreamVersion: 'v2',
      },
      messages: [{
        id: '40000000-0000-4000-8000-000000000001',
        role: 'assistant',
        content: 'They drain before rendering.',
        created_at: '2026-07-20T12:00:00.000Z',
        search_metadata: null,
        thread_id: threadId,
      }],
    });
    expect(tracker.queries.find((query) => query.table === 'threads')?.filters).toMatchObject({
      'eq:id': threadId,
      'eq:user_id': 'user-1',
    });
  });

  it('does not expose a thread owned by another user', async () => {
    const threadId = '10000000-0000-4000-8000-000000000002';
    const { supabase } = createAuthenticatedSupabase({
      threads: { rows: [] },
      messages: { rows: [] },
    });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const { GET } = await import('@/app/api/threads/[threadId]/messages/route');
    const response = await GET(
      new NextRequest(`http://localhost/api/threads/${threadId}/messages`),
      { params: Promise.resolve({ threadId }) }
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Thread not found' });
  });
});

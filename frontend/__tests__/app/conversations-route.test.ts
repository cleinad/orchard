import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createMockSupabase } from '../helpers/mock-supabase';

const mockCreateSupabaseServerClient = vi.fn();

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: () => mockCreateSupabaseServerClient(),
}));

function createAuthenticatedSupabase(
  tables: Record<string, { rows: object[]; returnOnMutate?: object[] }> = {}
) {
  const { client, tracker } = createMockSupabase({ tables });
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

async function runCreateConversationRequest(
  body: unknown,
  tables: Record<string, { rows: object[]; returnOnMutate?: object[] }> = {}
) {
  const { supabase, tracker } = createAuthenticatedSupabase(tables);
  mockCreateSupabaseServerClient.mockResolvedValue(supabase);

  const { POST } = await import('@/app/api/conversations/route');
  const request = new NextRequest('http://localhost/api/conversations', {
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

async function runDeleteConversationRequest(
  body: unknown,
  tables: Record<string, { rows: object[]; returnOnMutate?: object[] }> = {}
) {
  const { supabase, tracker } = createAuthenticatedSupabase(tables);
  mockCreateSupabaseServerClient.mockResolvedValue(supabase);

  const { DELETE } = await import('@/app/api/conversations/route');
  const request = new NextRequest('http://localhost/api/conversations', {
    method: 'DELETE',
    body: JSON.stringify(body),
    headers: {
      'content-type': 'application/json',
    },
  });

  const response = await DELETE(request);
  const json = await response.json();

  return { response, body: json, tracker };
}

describe('conversations route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a conversation with a fallback title from the first message', async () => {
    const { response, body, tracker } = await runCreateConversationRequest(
      {
        initialMessage: 'Help me think through product pricing',
        mentorId: null,
      },
      {
        conversations: {
          rows: [],
          returnOnMutate: [
            {
              id: 'conv-1',
              title: 'Help me think through product pricing',
              mentor_id: null,
              workspace_id: null,
              created_at: '2026-06-04T12:00:00.000Z',
              updated_at: '2026-06-04T12:00:00.000Z',
            },
          ],
        },
      }
    );

    expect(response.status).toBe(201);
    expect(body.conversation).toEqual({
      id: 'conv-1',
      title: 'Help me think through product pricing',
      mentorId: null,
      workspaceId: null,
      createdAt: '2026-06-04T12:00:00.000Z',
      updatedAt: '2026-06-04T12:00:00.000Z',
    });
    expect(tracker.inserts('conversations')[0].args).toEqual({
      user_id: 'user-1',
      title: 'Help me think through product pricing',
      mentor_id: null,
      workspace_id: null,
    });
  });

  it('creates a workspace conversation when workspaceId is provided', async () => {
    const { response, body, tracker } = await runCreateConversationRequest(
      {
        initialMessage: 'Plan the next training block',
        workspaceId: 'workspace-1',
      },
      {
        workspaces: {
          rows: [{ id: 'workspace-1' }],
        },
        conversations: {
          rows: [],
          returnOnMutate: [
            {
              id: 'conv-workspace-1',
              title: 'Plan the next training block',
              mentor_id: null,
              workspace_id: 'workspace-1',
              created_at: '2026-06-04T12:00:00.000Z',
              updated_at: '2026-06-04T12:00:00.000Z',
            },
          ],
        },
      }
    );

    expect(response.status).toBe(201);
    expect(body.conversation.workspaceId).toBe('workspace-1');
    expect(tracker.inserts('conversations')[0].args).toMatchObject({
      mentor_id: null,
      workspace_id: 'workspace-1',
    });
  });

  it('rejects conversations with both mentorId and workspaceId', async () => {
    const { response, body, tracker } = await runCreateConversationRequest({
      initialMessage: 'Ambiguous context',
      mentorId: 'mentor-1',
      workspaceId: 'workspace-1',
    });

    expect(response.status).toBe(400);
    expect(body.error).toBe('A conversation cannot have both a mentor and a workspace');
    expect(tracker.inserts('conversations')).toHaveLength(0);
  });

  it('requires mentor ownership when mentorId is provided', async () => {
    const { response, body, tracker } = await runCreateConversationRequest(
      {
        initialMessage: 'Start with this mentor',
        mentorId: 'mentor-1',
      },
      {
        mentors: {
          rows: [],
        },
      }
    );

    expect(response.status).toBe(404);
    expect(body.error).toBe('Mentor not found');
    expect(tracker.inserts('conversations')).toHaveLength(0);
  });

  it('rejects invalid create request bodies', async () => {
    const { response, body, tracker } = await runCreateConversationRequest({
      initialMessage: ['not', 'a', 'string'],
    });

    expect(response.status).toBe(400);
    expect(body.error).toBe('initialMessage must be a string');
    expect(tracker.inserts('conversations')).toHaveLength(0);
  });

  it('deletes empty conversations for best-effort cleanup', async () => {
    const { response, body, tracker } = await runDeleteConversationRequest(
      {
        conversationId: 'conv-empty-1',
      },
      {
        messages: {
          rows: [],
        },
      }
    );

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(tracker.deletes('conversations')[0].filters).toEqual({
      'eq:id': 'conv-empty-1',
      'eq:user_id': 'user-1',
    });
  });

  it('does not delete conversations that already have messages', async () => {
    const { response, body, tracker } = await runDeleteConversationRequest(
      {
        conversationId: 'conv-nonempty-1',
      },
      {
        messages: {
          rows: [{ id: 'msg-1' }],
        },
      }
    );

    expect(response.status).toBe(409);
    expect(body.error).toBe('Conversation is not empty');
    expect(tracker.deletes('conversations')).toHaveLength(0);
  });
});

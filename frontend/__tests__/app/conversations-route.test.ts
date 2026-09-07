import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createMockSupabase } from '../helpers/mock-supabase';

const mockCreateSupabaseServerClient = vi.fn();

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: () => mockCreateSupabaseServerClient(),
}));

function createAuthenticatedSupabase(
  tables: Record<string, { rows: object[]; returnOnMutate?: object[] }> = {},
  rpcResults: Record<string, { data?: unknown; error?: unknown }> = {}
) {
  const { client, tracker } = createMockSupabase({ tables, rpcResults });
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

async function runMoveConversationRequest(
  conversationId: string,
  body: unknown,
  rpcResults: Record<string, { data?: unknown; error?: unknown }> = {}
) {
  const { supabase, tracker } = createAuthenticatedSupabase({}, rpcResults);
  mockCreateSupabaseServerClient.mockResolvedValue(supabase);

  const { PATCH } = await import('@/app/api/conversations/[conversationId]/context/route');
  const request = new NextRequest(
    `http://localhost/api/conversations/${conversationId}/context`,
    {
      method: 'PATCH',
      body: JSON.stringify(body),
      headers: {
        'content-type': 'application/json',
      },
    }
  );

  const response = await PATCH(request, {
    params: Promise.resolve({ conversationId }),
  });
  const json = await response.json();

  return { response, body: json, tracker };
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

async function runTitleRequest(
  conversationId: string,
  body: unknown,
  tables: Record<string, {
    rows: object[];
    returnOnMutate?: object[];
    queryError?: unknown;
  }> = {}
) {
  const { supabase, tracker } = createAuthenticatedSupabase(tables);
  mockCreateSupabaseServerClient.mockResolvedValue(supabase);
  const { PATCH } = await import('@/app/api/conversations/[conversationId]/title/route');
  const response = await PATCH(new NextRequest(
    `http://localhost/api/conversations/${conversationId}/title`,
    {
      method: 'PATCH',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    }
  ), { params: Promise.resolve({ conversationId }) });
  return { response, body: await response.json(), tracker };
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

  it('records manual title provenance and increments its version', async () => {
    const conversationId = 'conversation-1';
    const { response, body, tracker } = await runTitleRequest(
      conversationId,
      { title: 'My deliberate title', expectedVersion: 2 },
      {
        conversations: {
          rows: [{ id: conversationId, title_version: 2 }],
        },
      }
    );

    expect(response.status).toBe(200);
    expect(body.title).toEqual({
      value: 'My deliberate title',
      source: 'user',
      version: 3,
    });
    expect(tracker.updates('conversations')[0].args).toEqual({
      title: 'My deliberate title',
      title_source: 'user',
      title_version: 3,
      title_run_id: null,
    });
  });

  it('reports a title lookup failure separately from a missing conversation', async () => {
    const { response, body, tracker } = await runTitleRequest(
      'conversation-1',
      { title: 'Unavailable edit' },
      {
        conversations: {
          rows: [],
          queryError: { message: 'database unavailable' },
        },
      }
    );

    expect(response.status).toBe(500);
    expect(body.error).toBe('Failed to load conversation');
    expect(tracker.updates('conversations')).toHaveLength(0);
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

  it('moves a conversation context through the transactional RPC', async () => {
    const { response, body, tracker } = await runMoveConversationRequest(
      'conversation-1',
      {
        workspaceId: 'workspace-1',
      },
      {
        move_conversation_context: {
          data: {
            conversation_found: true,
            target_workspace_found: true,
            conversation: {
              id: 'conversation-1',
              title: 'Training plan',
              mentor_id: null,
              workspace_id: 'workspace-1',
              created_at: '2026-06-27T12:00:00.000Z',
              updated_at: '2026-06-27T12:01:00.000Z',
            },
          },
          error: null,
        },
      }
    );

    expect(response.status).toBe(200);
    expect(body).toEqual({
      conversation: {
        id: 'conversation-1',
        title: 'Training plan',
        mentorId: null,
        workspaceId: 'workspace-1',
        createdAt: '2026-06-27T12:00:00.000Z',
        updatedAt: '2026-06-27T12:01:00.000Z',
      },
    });
    expect(tracker.rpcs).toEqual([
      {
        fn: 'move_conversation_context',
        args: {
          p_conversation_id: 'conversation-1',
          p_workspace_id: 'workspace-1',
        },
      },
    ]);
  });

  it('maps move validation failures to user-facing statuses', async () => {
    const missingConversation = await runMoveConversationRequest(
      'missing-conversation',
      { workspaceId: 'workspace-1' },
      {
        move_conversation_context: {
          data: { conversation_found: false },
          error: null,
        },
      }
    );
    expect(missingConversation.response.status).toBe(404);
    expect(missingConversation.body.error).toBe('Conversation not found');

    const missingWorkspace = await runMoveConversationRequest(
      'conversation-1',
      { workspaceId: 'missing-workspace' },
      {
        move_conversation_context: {
          data: { conversation_found: true, target_workspace_found: false },
          error: null,
        },
      }
    );
    expect(missingWorkspace.response.status).toBe(404);
    expect(missingWorkspace.body.error).toBe('Workspace not found');

    const mentorConversation = await runMoveConversationRequest(
      'conversation-mentor',
      { workspaceId: 'workspace-1' },
      {
        move_conversation_context: {
          data: { conversation_found: true, error: 'mentor_context_unsupported' },
          error: null,
        },
      }
    );
    expect(mentorConversation.response.status).toBe(400);
    expect(mentorConversation.body.error).toBe('Mentor conversations cannot be moved yet');
  });
});

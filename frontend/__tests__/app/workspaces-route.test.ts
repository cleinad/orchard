import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createMockSupabase } from '../helpers/mock-supabase';

const mockCreateSupabaseServerClient = vi.fn();
const mockStorageRemove = vi.fn();

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: () => mockCreateSupabaseServerClient(),
}));

function createRouteSupabase({
  tables = {},
  rpcResults = {},
  authenticated = true,
}: {
  tables?: Record<string, { rows: object[]; returnOnMutate?: object[] }>;
  rpcResults?: Record<string, { data?: unknown; error?: unknown }>;
  authenticated?: boolean;
} = {}) {
  const { client, tracker } = createMockSupabase({ tables, rpcResults });
  const supabase = {
    ...client,
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: authenticated ? { id: 'user-1' } : null },
        error: null,
      }),
    },
    storage: {
      from: vi.fn(() => ({
        remove: (...args: unknown[]) => mockStorageRemove(...args),
      })),
    },
  };

  return { supabase, tracker };
}

describe('workspaces route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStorageRemove.mockResolvedValue({ data: null, error: null });
  });

  it('lists authenticated user workspaces', async () => {
    const { supabase, tracker } = createRouteSupabase({
      tables: {
        workspaces: {
          rows: [
            {
              id: 'workspace-1',
              name: 'Health',
              description: 'Training and recovery',
              context: null,
              icon: 'H',
              accent_color: '#2563eb',
              created_at: '2026-06-25T12:00:00.000Z',
              updated_at: '2026-06-25T12:00:00.000Z',
            },
          ],
        },
      },
    });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const { GET } = await import('@/app/api/workspaces/route');
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.workspaces).toHaveLength(1);
    expect(body.workspaces[0].name).toBe('Health');
    expect(tracker.selects('workspaces')[0].filters).toMatchObject({
      'eq:user_id': 'user-1',
    });
  });

  it('creates a sanitized workspace', async () => {
    const { supabase, tracker } = createRouteSupabase({
      tables: {
        workspaces: {
          rows: [],
          returnOnMutate: [
            {
              id: 'workspace-created',
              name: 'Math 337',
              description: 'Linear algebra',
              context: 'Use course notation.',
              icon: 'M',
              accent_color: '#0f766e',
              created_at: '2026-06-25T12:00:00.000Z',
              updated_at: '2026-06-25T12:00:00.000Z',
            },
          ],
        },
      },
    });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const { POST } = await import('@/app/api/workspaces/route');
    const request = new NextRequest('http://localhost/api/workspaces', {
      method: 'POST',
      body: JSON.stringify({
        name: '  Math   337  ',
        description: '  Linear algebra  ',
        context: 'Use course notation.',
        icon: 'M',
        accent_color: '#0f766e',
      }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.workspace.id).toBe('workspace-created');
    expect(tracker.inserts('workspaces')[0].args).toMatchObject({
      user_id: 'user-1',
      name: 'Math 337',
      description: 'Linear algebra',
      context: 'Use course notation.',
      icon: 'M',
      accent_color: '#0f766e',
    });
  });

  it('updates workspace context by owner', async () => {
    const { supabase, tracker } = createRouteSupabase({
      tables: {
        workspaces: {
          rows: [{ id: 'workspace-1' }],
          returnOnMutate: [
            {
              id: 'workspace-1',
              name: 'Health',
              description: null,
              context: 'Prefer precise training language.',
              icon: null,
              accent_color: null,
              created_at: '2026-06-25T12:00:00.000Z',
              updated_at: '2026-06-25T12:01:00.000Z',
            },
          ],
        },
      },
    });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const { PATCH } = await import('@/app/api/workspaces/[workspaceId]/route');
    const request = new NextRequest('http://localhost/api/workspaces/workspace-1', {
      method: 'PATCH',
      body: JSON.stringify({ context: 'Prefer precise training language.' }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await PATCH(request, {
      params: Promise.resolve({ workspaceId: 'workspace-1' }),
    });

    expect(response.status).toBe(200);
    expect(tracker.updates('workspaces')[0].args).toEqual({
      context: 'Prefer precise training language.',
    });
    expect(tracker.updates('workspaces')[0].filters).toMatchObject({
      'eq:id': 'workspace-1',
      'eq:user_id': 'user-1',
    });
  });

  it('rejects unauthenticated workspace deletion', async () => {
    const { supabase, tracker } = createRouteSupabase({ authenticated: false });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const { DELETE } = await import('@/app/api/workspaces/[workspaceId]/route');
    const response = await DELETE(
      new NextRequest('http://localhost/api/workspaces/workspace-1', {
        method: 'DELETE',
      }),
      { params: Promise.resolve({ workspaceId: 'workspace-1' }) }
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
    expect(tracker.deletes('workspaces')).toHaveLength(0);
    expect(tracker.rpcs).toHaveLength(0);
  });

  it('returns 404 when the workspace delete RPC reports no owned workspace', async () => {
    const { supabase, tracker } = createRouteSupabase({
      rpcResults: {
        delete_workspace_cascade: {
          data: {
            workspace_deleted: false,
            conversation_count: 0,
            storage_paths: [],
          },
          error: null,
        },
      },
    });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const { DELETE } = await import('@/app/api/workspaces/[workspaceId]/route');
    const response = await DELETE(
      new NextRequest('http://localhost/api/workspaces/missing-workspace', {
        method: 'DELETE',
      }),
      { params: Promise.resolve({ workspaceId: 'missing-workspace' }) }
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Workspace not found' });
    expect(tracker.rpcs).toEqual([
      {
        fn: 'delete_workspace_cascade',
        args: { p_workspace_id: 'missing-workspace' },
      },
    ]);
    expect(tracker.deletes('workspaces')).toHaveLength(0);
  });

  it('returns delete counts and cleans storage paths after the transactional RPC succeeds', async () => {
    const { supabase, tracker } = createRouteSupabase({
      rpcResults: {
        delete_workspace_cascade: {
          data: {
            workspace_deleted: true,
            conversation_count: 2,
            memory_item_count: 2,
            storage_paths: ['user-1/photo-a.png', 'user-1/photo-b.png'],
          },
          error: null,
        },
      },
    });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const { DELETE } = await import('@/app/api/workspaces/[workspaceId]/route');
    const response = await DELETE(
      new NextRequest('http://localhost/api/workspaces/workspace-1', {
        method: 'DELETE',
      }),
      { params: Promise.resolve({ workspaceId: 'workspace-1' }) }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      deleted: {
        workspace: 1,
        conversations: 2,
      },
    });

    expect(tracker.rpcs).toEqual([
      {
        fn: 'delete_workspace_cascade',
        args: { p_workspace_id: 'workspace-1' },
      },
    ]);
    expect(tracker.deletes('conversations')).toHaveLength(0);
    expect(tracker.deletes('workspaces')).toHaveLength(0);
    expect(mockStorageRemove).toHaveBeenCalledWith([
      'user-1/photo-a.png',
      'user-1/photo-b.png',
    ]);
  });

  it('deletes an empty workspace without embedding or storage cleanup', async () => {
    const { supabase, tracker } = createRouteSupabase({
      rpcResults: {
        delete_workspace_cascade: {
          data: {
            workspace_deleted: true,
            conversation_count: 0,
            storage_paths: [],
          },
          error: null,
        },
      },
    });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const { DELETE } = await import('@/app/api/workspaces/[workspaceId]/route');
    const response = await DELETE(
      new NextRequest('http://localhost/api/workspaces/workspace-empty', {
        method: 'DELETE',
      }),
      { params: Promise.resolve({ workspaceId: 'workspace-empty' }) }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.deleted).toEqual({
      workspace: 1,
      conversations: 0,
    });
    expect(tracker.selects('messages')).toHaveLength(0);
    expect(tracker.deletes('workspaces')).toHaveLength(0);
    expect(mockStorageRemove).not.toHaveBeenCalled();
  });

  it('does not fail deletion when best-effort storage cleanup throws', async () => {
    mockStorageRemove.mockRejectedValueOnce(new Error('storage unavailable'));
    const { supabase, tracker } = createRouteSupabase({
      rpcResults: {
        delete_workspace_cascade: {
          data: {
            workspace_deleted: true,
            conversation_count: 1,
            storage_paths: ['user-1/photo.png'],
          },
          error: null,
        },
      },
    });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const { DELETE } = await import('@/app/api/workspaces/[workspaceId]/route');
    const response = await DELETE(
      new NextRequest('http://localhost/api/workspaces/workspace-1', {
        method: 'DELETE',
      }),
      { params: Promise.resolve({ workspaceId: 'workspace-1' }) }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.deleted).toEqual({
      workspace: 1,
      conversations: 1,
    });
    expect(tracker.deletes('conversations')).toHaveLength(0);
    expect(tracker.deletes('workspaces')).toHaveLength(0);
    expect(mockStorageRemove).toHaveBeenCalledWith(['user-1/photo.png']);
  });

  it('returns 500 when the workspace delete RPC fails', async () => {
    const { supabase, tracker } = createRouteSupabase({
      rpcResults: {
        delete_workspace_cascade: {
          data: null,
          error: { message: 'database unavailable' },
        },
      },
    });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const { DELETE } = await import('@/app/api/workspaces/[workspaceId]/route');
    const response = await DELETE(
      new NextRequest('http://localhost/api/workspaces/workspace-1', {
        method: 'DELETE',
      }),
      { params: Promise.resolve({ workspaceId: 'workspace-1' }) }
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Failed to delete workspace' });
    expect(tracker.rpcs).toHaveLength(1);
    expect(mockStorageRemove).not.toHaveBeenCalled();
  });
});

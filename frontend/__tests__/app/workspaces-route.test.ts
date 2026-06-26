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

describe('workspaces route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists authenticated user workspaces', async () => {
    const { supabase, tracker } = createAuthenticatedSupabase({
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
    const { supabase, tracker } = createAuthenticatedSupabase({
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
    const { supabase, tracker } = createAuthenticatedSupabase({
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
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createMockSupabase } from '../helpers/mock-supabase';

const mockCreateSupabaseServerClient = vi.fn();
const mockUpsertMemoryItemEmbeddings = vi.fn();
const mockDeleteMemoryItemEmbedding = vi.fn();

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: () => mockCreateSupabaseServerClient(),
}));

vi.mock('@/lib/memory-items-server', () => ({
  upsertMemoryItemEmbeddings: (...args: unknown[]) => mockUpsertMemoryItemEmbeddings(...args),
  deleteMemoryItemEmbedding: (...args: unknown[]) => mockDeleteMemoryItemEmbedding(...args),
}));

function createRouteSupabase({
  tables = {},
  authenticated = true,
}: {
  tables?: Record<string, { rows: object[]; returnOnMutate?: object[] }>;
  authenticated?: boolean;
} = {}) {
  const { client, tracker } = createMockSupabase({ tables });
  const supabase = {
    ...client,
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: authenticated ? { id: 'user-1' } : null },
        error: null,
      }),
    },
  };

  return { supabase, tracker };
}

describe('memory item routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpsertMemoryItemEmbeddings.mockResolvedValue(undefined);
    mockDeleteMemoryItemEmbedding.mockResolvedValue(undefined);
  });

  it('rejects unauthenticated GET requests', async () => {
    const { supabase } = createRouteSupabase({ authenticated: false });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const { GET } = await import('@/app/api/memory/items/route');
    const response = await GET(new NextRequest('http://localhost/api/memory/items'));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
  });

  it('applies scope and status filters for GET /api/memory/items', async () => {
    const { supabase, tracker } = createRouteSupabase({
      tables: {
        memory_items: { rows: [] },
      },
    });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const { GET } = await import('@/app/api/memory/items/route');
    const response = await GET(
      new NextRequest(
        'http://localhost/api/memory/items?scope=mentor:mentor-abc&status=deleted'
      )
    );

    expect(response.status).toBe(200);
    expect(tracker.selects('memory_items')).toHaveLength(1);
    expect(tracker.selects('memory_items')[0].filters).toMatchObject({
      'eq:user_id': 'user-1',
      'eq:status': 'deleted',
      'eq:owner_type': 'mentor',
      'eq:owner_id': 'mentor-abc',
    });
  });

  it('normalizes PATCH payloads and re-embeds active items', async () => {
    const { supabase, tracker } = createRouteSupabase({
      tables: {
        memory_items: {
          rows: [],
          returnOnMutate: [
            {
              id: 'memory-1',
              text: 'Clean text',
              type: 'project-update',
              status: 'active',
            },
          ],
        },
      },
    });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const { PATCH } = await import('@/app/api/memory/items/[id]/route');
    const response = await PATCH(
      new NextRequest('http://localhost/api/memory/items/memory-1', {
        method: 'PATCH',
        body: JSON.stringify({
          text: '  Clean text  ',
          type: ' Project Update! ',
        }),
        headers: {
          'content-type': 'application/json',
        },
      }),
      { params: Promise.resolve({ id: 'memory-1' }) }
    );

    expect(response.status).toBe(200);
    expect(tracker.updates('memory_items')).toHaveLength(1);
    expect(tracker.updates('memory_items')[0].args).toMatchObject({
      text: 'Clean text',
      normalized_text: 'clean text',
      type: 'project-update',
    });
    expect(mockUpsertMemoryItemEmbeddings).toHaveBeenCalledWith(
      supabase,
      'user-1',
      [{ memoryItemId: 'memory-1', text: 'Clean text' }]
    );
    expect(mockDeleteMemoryItemEmbedding).not.toHaveBeenCalled();
  });

  it('deletes embeddings when PATCH transitions an item out of active status', async () => {
    const { supabase } = createRouteSupabase({
      tables: {
        memory_items: {
          rows: [],
          returnOnMutate: [
            {
              id: 'memory-2',
              text: 'Old item',
              type: 'project',
              status: 'deleted',
            },
          ],
        },
      },
    });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const { PATCH } = await import('@/app/api/memory/items/[id]/route');
    const response = await PATCH(
      new NextRequest('http://localhost/api/memory/items/memory-2', {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'deleted',
        }),
        headers: {
          'content-type': 'application/json',
        },
      }),
      { params: Promise.resolve({ id: 'memory-2' }) }
    );

    expect(response.status).toBe(200);
    expect(mockUpsertMemoryItemEmbeddings).not.toHaveBeenCalled();
    expect(mockDeleteMemoryItemEmbedding).toHaveBeenCalledWith(
      supabase,
      'user-1',
      'memory-2'
    );
  });

  it('soft-deletes items and removes embeddings on DELETE', async () => {
    const { supabase, tracker } = createRouteSupabase({
      tables: {
        memory_items: {
          rows: [],
          returnOnMutate: [
            {
              id: 'memory-3',
              text: 'To be deleted',
              type: 'project',
              status: 'deleted',
            },
          ],
        },
      },
    });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const { DELETE } = await import('@/app/api/memory/items/[id]/route');
    const response = await DELETE(
      new NextRequest('http://localhost/api/memory/items/memory-3', {
        method: 'DELETE',
      }),
      { params: Promise.resolve({ id: 'memory-3' }) }
    );

    expect(response.status).toBe(200);
    expect(tracker.updates('memory_items')).toHaveLength(1);
    expect(tracker.updates('memory_items')[0].args).toEqual({ status: 'deleted' });
    expect(mockDeleteMemoryItemEmbedding).toHaveBeenCalledWith(
      supabase,
      'user-1',
      'memory-3'
    );
  });

  it('rejects invalid PATCH bodies', async () => {
    const { supabase } = createRouteSupabase();
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const { PATCH } = await import('@/app/api/memory/items/[id]/route');
    const response = await PATCH(
      new NextRequest('http://localhost/api/memory/items/memory-4', {
        method: 'PATCH',
        body: JSON.stringify({}),
        headers: {
          'content-type': 'application/json',
        },
      }),
      { params: Promise.resolve({ id: 'memory-4' }) }
    );

    expect(response.status).toBe(400);
    expect(mockUpsertMemoryItemEmbeddings).not.toHaveBeenCalled();
    expect(mockDeleteMemoryItemEmbedding).not.toHaveBeenCalled();
  });
});

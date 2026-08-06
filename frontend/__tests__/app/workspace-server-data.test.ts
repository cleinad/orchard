import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockSupabase } from '../helpers/mock-supabase';

const mockCreateSupabaseServerClient = vi.hoisted(() => vi.fn());
const mockGetViewerIdentity = vi.hoisted(() => vi.fn());
const mockGetChatModelListItems = vi.hoisted(() => vi.fn());

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: () => mockCreateSupabaseServerClient(),
}));
vi.mock('@/lib/viewer-server', () => ({
  getViewerIdentity: () => mockGetViewerIdentity(),
}));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((location: string) => {
    throw new Error(`NEXT_REDIRECT:${location}`);
  }),
}));
vi.mock('@/lib/models', () => ({
  getChatModelListItems: () => mockGetChatModelListItems(),
}));

const viewerIdentity = {
  id: 'user-1',
  email: 'viewer@example.com',
};

describe('workspace server data', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockGetViewerIdentity.mockResolvedValue(viewerIdentity);
    mockGetChatModelListItems.mockReturnValue([
      {
        id: 'gpt-5.6-sol',
        label: 'GPT-5.6 Sol',
        provider: 'openai',
        providerLabel: 'OpenAI',
        iconKey: 'openai',
        description: 'Test model',
        available: true,
        isDefault: true,
      },
    ]);
  });

  it('loads scoped navigation summaries without workspace context', async () => {
    const { client, tracker } = createMockSupabase({
      tables: {
        mentors: {
          rows: [
            {
              id: 'mentor-1',
              user_id: 'user-1',
              slug: 'math',
              name: 'Math',
              tagline: 'Learn math',
              description: null,
              is_builtin: true,
              accent_color: '#2563eb',
              avatar_url: null,
            },
          ],
        },
        workspaces: {
          rows: [
            {
              id: 'workspace-1',
              user_id: 'user-1',
              name: 'Health',
              description: 'Training',
              context: 'Must not enter navigation state',
              icon: 'H',
              accent_color: '#2563eb',
              created_at: '2026-08-01T00:00:00.000Z',
              updated_at: '2026-08-02T00:00:00.000Z',
            },
            {
              id: 'workspace-other',
              user_id: 'user-2',
              name: 'Private',
              description: null,
              context: 'Other user context',
              icon: null,
              accent_color: null,
              created_at: '2026-08-01T00:00:00.000Z',
              updated_at: '2026-08-03T00:00:00.000Z',
            },
          ],
        },
        conversations: {
          rows: [
            {
              id: 'conversation-1',
              user_id: 'user-1',
              title: 'Zone 2 plan',
              mentor_id: null,
              workspace_id: 'workspace-1',
              created_at: '2026-08-01T00:00:00.000Z',
              updated_at: '2026-08-02T01:00:00.000Z',
            },
          ],
        },
      },
    });
    mockCreateSupabaseServerClient.mockResolvedValue(client);

    const { getHomeBootstrap } = await import('@/app/home/server-data');
    const result = await getHomeBootstrap();

    expect(mockGetViewerIdentity).toHaveBeenCalledTimes(1);
    expect(result.navigation.workspaces).toEqual([
      {
        id: 'workspace-1',
        name: 'Health',
        description: 'Training',
        icon: 'H',
        accent_color: '#2563eb',
        created_at: '2026-08-01T00:00:00.000Z',
        updated_at: '2026-08-02T00:00:00.000Z',
      },
    ]);
    expect(result.navigation.workspaces[0]).not.toHaveProperty('context');
    expect(result.navigation.conversations[0]).toMatchObject({
      id: 'conversation-1',
      workspace_id: 'workspace-1',
      workspace_name: 'Health',
    });
    expect(result.chatModels).toHaveLength(1);

    expect(tracker.selects('mentors')[0]).toMatchObject({
      args: 'id, slug, name, tagline, description, is_builtin, accent_color, avatar_url',
      filters: { 'eq:user_id': 'user-1' },
    });
    expect(tracker.selects('workspaces')[0]).toMatchObject({
      args: 'id, name, description, icon, accent_color, created_at, updated_at',
      filters: { 'eq:user_id': 'user-1' },
    });
    expect(tracker.selects('conversations')[0]).toMatchObject({
      args: 'id, title, mentor_id, workspace_id, updated_at, created_at',
      filters: { 'eq:user_id': 'user-1' },
    });
  });

  it('loads one owned workspace detail and returns null for an unowned id', async () => {
    const { client, tracker } = createMockSupabase({
      tables: {
        workspaces: {
          rows: [
            {
              id: 'workspace-1',
              user_id: 'user-1',
              name: 'Health',
              description: 'Training',
              context: 'Use training context.',
              icon: 'H',
              accent_color: '#2563eb',
              created_at: '2026-08-01T00:00:00.000Z',
              updated_at: '2026-08-02T00:00:00.000Z',
            },
            {
              id: 'workspace-2',
              user_id: 'user-2',
              name: 'Other user workspace',
              description: null,
              context: 'Private',
              icon: null,
              accent_color: null,
              created_at: '2026-08-01T00:00:00.000Z',
              updated_at: '2026-08-02T00:00:00.000Z',
            },
          ],
        },
      },
    });
    mockCreateSupabaseServerClient.mockResolvedValue(client);

    const { getWorkspaceDetail } = await import(
      '@/app/workspaces/[workspaceId]/data'
    );

    await expect(getWorkspaceDetail('workspace-1')).resolves.toMatchObject({
      id: 'workspace-1',
      context: 'Use training context.',
    });
    await expect(getWorkspaceDetail('workspace-2')).resolves.toBeNull();

    expect(tracker.selects('workspaces')).toHaveLength(2);
    expect(tracker.selects('workspaces')[0]).toMatchObject({
      args: 'id, name, description, context, icon, accent_color, created_at, updated_at',
      filters: {
        'eq:id': 'workspace-1',
        'eq:user_id': 'user-1',
      },
    });
    expect(tracker.selects('workspaces')[1].filters).toMatchObject({
      'eq:id': 'workspace-2',
      'eq:user_id': 'user-1',
    });
  });

  it('surfaces workspace detail query failures instead of leaking a false not-found', async () => {
    const { client } = createMockSupabase({
      tables: {
        workspaces: {
          rows: [],
          queryError: { message: 'database unavailable' },
        },
      },
    });
    mockCreateSupabaseServerClient.mockResolvedValue(client);

    const { getWorkspaceDetail } = await import(
      '@/app/workspaces/[workspaceId]/data'
    );

    await expect(getWorkspaceDetail('workspace-1')).rejects.toThrow(
      'Failed to load workspace: database unavailable'
    );
  });

  it('redirects before querying workspace data when verified claims are unavailable', async () => {
    const { client, tracker } = createMockSupabase({
      tables: {
        workspaces: { rows: [] },
      },
    });
    mockCreateSupabaseServerClient.mockResolvedValue(client);
    mockGetViewerIdentity.mockResolvedValue(null);

    const { getWorkspaceDetail } = await import(
      '@/app/workspaces/[workspaceId]/data'
    );

    await expect(getWorkspaceDetail('workspace-unauthenticated')).rejects.toThrow(
      'NEXT_REDIRECT:/login'
    );
    expect(tracker.selects('workspaces')).toHaveLength(0);
  });
});

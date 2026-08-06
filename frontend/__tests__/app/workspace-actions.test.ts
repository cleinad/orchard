import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRevalidatePath = vi.hoisted(() => vi.fn());
const mockUpdateWorkspace = vi.hoisted(() => vi.fn());
const mockDeleteWorkspace = vi.hoisted(() => vi.fn());

vi.mock('next/cache', () => ({
  revalidatePath: (path: string) => mockRevalidatePath(path),
}));
vi.mock('@/app/workspaces/[workspaceId]/server-mutations', () => ({
  updateWorkspaceForCurrentUser: (
    workspaceId: string,
    input: unknown
  ) => mockUpdateWorkspace(workspaceId, input),
  deleteWorkspaceForCurrentUser: (workspaceId: string) =>
    mockDeleteWorkspace(workspaceId),
}));

import {
  deleteWorkspace,
  updateWorkspace,
} from '@/app/workspaces/[workspaceId]/actions';

const workspace = {
  id: 'workspace/encoded',
  name: 'Health',
  description: null,
  context: 'Use precise language.',
  icon: null,
  accent_color: null,
  created_at: '2026-08-01T00:00:00.000Z',
  updated_at: '2026-08-05T00:00:00.000Z',
};

describe('workspace server actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the persisted update and invalidates its exact workspace page', async () => {
    mockUpdateWorkspace.mockResolvedValue({
      status: 'updated',
      workspace,
    });

    await expect(
      updateWorkspace(workspace.id, { name: 'Health' })
    ).resolves.toEqual({
      status: 'updated',
      workspace,
    });

    expect(mockUpdateWorkspace).toHaveBeenCalledWith(workspace.id, {
      name: 'Health',
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith(
      '/workspaces/workspace%2Fencoded'
    );
  });

  it('does not invalidate when an update fails', async () => {
    mockUpdateWorkspace.mockResolvedValue({
      status: 'error',
      statusCode: 404,
      error: 'Workspace not found',
    });

    await expect(
      updateWorkspace('workspace-missing', { name: 'Missing' })
    ).resolves.toEqual({
      status: 'error',
      error: 'Workspace not found',
    });
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it('invalidates a deleted workspace before returning success', async () => {
    mockDeleteWorkspace.mockResolvedValue({
      status: 'deleted',
      conversations: 2,
    });

    await expect(deleteWorkspace('workspace-1')).resolves.toEqual({
      status: 'deleted',
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith('/workspaces/workspace-1');
  });

  it('does not invalidate when deletion fails', async () => {
    mockDeleteWorkspace.mockResolvedValue({
      status: 'error',
      statusCode: 500,
      error: 'Failed to delete workspace',
    });

    await expect(deleteWorkspace('workspace-1')).resolves.toEqual({
      status: 'error',
      error: 'Failed to delete workspace',
    });
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });
});

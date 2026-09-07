'use server';

import { revalidatePath } from 'next/cache';
import {
  deleteWorkspaceForCurrentUser,
  updateWorkspaceForCurrentUser,
} from '@/app/workspaces/[workspaceId]/server-mutations';
import type { WorkspaceDetail, WorkspaceInput } from '@/lib/workspaces';

export type UpdateWorkspaceActionResult =
  | {
      status: 'updated';
      workspace: WorkspaceDetail;
    }
  | {
      status: 'error';
      error: string;
    };

export type DeleteWorkspaceActionResult =
  | {
      status: 'deleted';
    }
  | {
      status: 'error';
      error: string;
    };

function workspacePath(workspaceId: string) {
  return `/workspaces/${encodeURIComponent(workspaceId)}`;
}

export async function updateWorkspace(
  workspaceId: string,
  input: WorkspaceInput
): Promise<UpdateWorkspaceActionResult> {
  try {
    const result = await updateWorkspaceForCurrentUser(workspaceId, input);
    if (result.status === 'error') {
      return { status: 'error', error: result.error };
    }

    revalidatePath(workspacePath(workspaceId));
    return result;
  } catch (error) {
    console.error('Workspace update action error:', error);
    return { status: 'error', error: 'Failed to update workspace' };
  }
}

export async function deleteWorkspace(
  workspaceId: string
): Promise<DeleteWorkspaceActionResult> {
  try {
    const result = await deleteWorkspaceForCurrentUser(workspaceId);
    if (result.status === 'error') {
      return { status: 'error', error: result.error };
    }

    revalidatePath(workspacePath(workspaceId));
    return { status: 'deleted' };
  } catch (error) {
    console.error('Workspace delete action error:', error);
    return { status: 'error', error: 'Failed to delete workspace' };
  }
}

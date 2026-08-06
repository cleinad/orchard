import 'server-only';

import { createSupabaseServerClient } from '@/lib/supabase-server';
import {
  mapWorkspaceRow,
  sanitizeWorkspaceAccentColor,
  sanitizeWorkspaceContext,
  sanitizeWorkspaceDescription,
  sanitizeWorkspaceIcon,
  sanitizeWorkspaceName,
  type WorkspaceDetail,
} from '@/lib/workspaces';

interface WorkspaceMutationFailure {
  status: 'error';
  statusCode: 400 | 401 | 404 | 500;
  error: string;
}

export type UpdateWorkspaceResult =
  | {
      status: 'updated';
      workspace: WorkspaceDetail;
    }
  | WorkspaceMutationFailure;

export type DeleteWorkspaceResult =
  | {
      status: 'deleted';
      conversations: number;
    }
  | WorkspaceMutationFailure;

interface DeleteWorkspaceRpcResult {
  workspace_deleted: boolean;
  conversation_count: number;
  storage_paths: string[];
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseDeleteWorkspaceResult(
  value: unknown
): DeleteWorkspaceRpcResult | null {
  if (!isJsonObject(value)) return null;

  const {
    workspace_deleted: workspaceDeleted,
    conversation_count: conversationCount,
    storage_paths: storagePaths,
  } = value;

  if (
    typeof workspaceDeleted !== 'boolean'
    || typeof conversationCount !== 'number'
    || !Array.isArray(storagePaths)
  ) {
    return null;
  }

  return {
    workspace_deleted: workspaceDeleted,
    conversation_count: conversationCount,
    storage_paths: storagePaths.filter(
      (path): path is string => typeof path === 'string'
    ),
  };
}

export async function updateWorkspaceForCurrentUser(
  workspaceId: string,
  input: unknown
): Promise<UpdateWorkspaceResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { status: 'error', statusCode: 401, error: 'Unauthorized' };
  }

  if (!isJsonObject(input)) {
    return {
      status: 'error',
      statusCode: 400,
      error: 'Invalid request body',
    };
  }

  const updateBody: Record<string, unknown> = {};

  if ('name' in input) {
    const name = sanitizeWorkspaceName(input.name);
    if (!name) {
      return {
        status: 'error',
        statusCode: 400,
        error: 'Workspace name is required',
      };
    }
    updateBody.name = name;
  }

  if ('description' in input) {
    updateBody.description = sanitizeWorkspaceDescription(input.description);
  }

  if ('context' in input) {
    updateBody.context = sanitizeWorkspaceContext(input.context);
  }

  if ('icon' in input) {
    updateBody.icon = sanitizeWorkspaceIcon(input.icon);
  }

  if ('accent_color' in input) {
    updateBody.accent_color = sanitizeWorkspaceAccentColor(input.accent_color);
  }

  if (Object.keys(updateBody).length === 0) {
    return {
      status: 'error',
      statusCode: 400,
      error: 'No fields to update',
    };
  }

  const { data, error } = await supabase
    .from('workspaces')
    .update(updateBody)
    .eq('id', workspaceId)
    .eq('user_id', user.id)
    .select(
      'id, name, description, context, icon, accent_color, created_at, updated_at'
    )
    .single();

  if (error || !data) {
    console.error('Workspace update error:', error);
    return {
      status: 'error',
      statusCode: 404,
      error: 'Workspace not found',
    };
  }

  return {
    status: 'updated',
    workspace: mapWorkspaceRow(data as WorkspaceDetail),
  };
}

export async function deleteWorkspaceForCurrentUser(
  workspaceId: string
): Promise<DeleteWorkspaceResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { status: 'error', statusCode: 401, error: 'Unauthorized' };
  }

  const { data, error } = await supabase.rpc('delete_workspace_cascade', {
    p_workspace_id: workspaceId,
  });

  if (error) {
    console.error('Workspace delete RPC error:', error);
    return {
      status: 'error',
      statusCode: 500,
      error: 'Failed to delete workspace',
    };
  }

  const result = parseDeleteWorkspaceResult(data);
  if (!result) {
    console.error('Workspace delete RPC returned an unexpected payload');
    return {
      status: 'error',
      statusCode: 500,
      error: 'Failed to delete workspace',
    };
  }

  if (!result.workspace_deleted) {
    return {
      status: 'error',
      statusCode: 404,
      error: 'Workspace not found',
    };
  }

  if (result.storage_paths.length > 0) {
    try {
      const { error: storageError } = await supabase.storage
        .from('chat-images')
        .remove(result.storage_paths);

      if (storageError) {
        console.error('Workspace storage cleanup after delete error:', storageError);
      }
    } catch (storageError) {
      console.error('Workspace storage cleanup after delete error:', storageError);
    }
  }

  return {
    status: 'deleted',
    conversations: result.conversation_count,
  };
}

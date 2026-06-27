import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import {
  mapWorkspaceRow,
  sanitizeWorkspaceAccentColor,
  sanitizeWorkspaceContext,
  sanitizeWorkspaceDescription,
  sanitizeWorkspaceIcon,
  sanitizeWorkspaceName,
  type WorkspaceListItem,
} from '@/lib/workspaces';

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readJsonObject(request: NextRequest) {
  try {
    const body = await request.json();
    return isJsonObject(body) ? body : null;
  } catch {
    return null;
  }
}

async function getAuthenticatedUser(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>
) {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;
  return user;
}

interface DeleteWorkspaceResult {
  workspace_deleted: boolean;
  conversation_count: number;
  memory_item_count: number;
  storage_paths: string[];
}

function parseDeleteWorkspaceResult(value: unknown): DeleteWorkspaceResult | null {
  if (!isJsonObject(value)) return null;

  const {
    workspace_deleted: workspaceDeleted,
    conversation_count: conversationCount,
    memory_item_count: memoryItemCount,
    storage_paths: storagePaths,
  } = value;

  if (
    typeof workspaceDeleted !== 'boolean'
    || typeof conversationCount !== 'number'
    || typeof memoryItemCount !== 'number'
    || !Array.isArray(storagePaths)
  ) {
    return null;
  }

  return {
    workspace_deleted: workspaceDeleted,
    conversation_count: conversationCount,
    memory_item_count: memoryItemCount,
    storage_paths: storagePaths.filter((path): path is string => typeof path === 'string'),
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const { workspaceId } = await params;
    const supabase = await createSupabaseServerClient();
    const user = await getAuthenticatedUser(supabase);

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('workspaces')
      .select('id, name, description, context, icon, accent_color, created_at, updated_at')
      .eq('id', workspaceId)
      .eq('user_id', user.id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    }

    return NextResponse.json({ workspace: mapWorkspaceRow(data as WorkspaceListItem) });
  } catch (error) {
    console.error('Workspace GET route error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const { workspaceId } = await params;
    const supabase = await createSupabaseServerClient();
    const user = await getAuthenticatedUser(supabase);

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await readJsonObject(request);
    if (!body) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const updateBody: Record<string, unknown> = {};

    if ('name' in body) {
      const name = sanitizeWorkspaceName(body.name);
      if (!name) {
        return NextResponse.json({ error: 'Workspace name is required' }, { status: 400 });
      }
      updateBody.name = name;
    }

    if ('description' in body) {
      updateBody.description = sanitizeWorkspaceDescription(body.description);
    }

    if ('context' in body) {
      updateBody.context = sanitizeWorkspaceContext(body.context);
    }

    if ('icon' in body) {
      updateBody.icon = sanitizeWorkspaceIcon(body.icon);
    }

    if ('accent_color' in body) {
      updateBody.accent_color = sanitizeWorkspaceAccentColor(body.accent_color);
    }

    if (Object.keys(updateBody).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('workspaces')
      .update(updateBody)
      .eq('id', workspaceId)
      .eq('user_id', user.id)
      .select('id, name, description, context, icon, accent_color, created_at, updated_at')
      .single();

    if (error || !data) {
      console.error('Workspace PATCH error:', error);
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    }

    return NextResponse.json({ workspace: mapWorkspaceRow(data as WorkspaceListItem) });
  } catch (error) {
    console.error('Workspace PATCH route error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const { workspaceId } = await params;
    const supabase = await createSupabaseServerClient();
    const user = await getAuthenticatedUser(supabase);

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase.rpc('delete_workspace_cascade', {
      p_workspace_id: workspaceId,
    });

    if (error) {
      console.error('Workspace DELETE RPC error:', error);
      return NextResponse.json({ error: 'Failed to delete workspace' }, { status: 500 });
    }

    const result = parseDeleteWorkspaceResult(data);
    if (!result) {
      console.error('Workspace DELETE RPC returned an unexpected payload:', data);
      return NextResponse.json({ error: 'Failed to delete workspace' }, { status: 500 });
    }

    if (!result.workspace_deleted) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    }

    if (result.storage_paths.length > 0) {
      try {
        const { error: storageError } = await supabase.storage
          .from('chat-images')
          .remove(result.storage_paths);

        if (storageError) {
          console.error('Workspace storage cleanup after DELETE error:', storageError);
        }
      } catch (storageError) {
        console.error('Workspace storage cleanup after DELETE error:', storageError);
      }
    }

    return NextResponse.json({
      success: true,
      deleted: {
        workspace: 1,
        conversations: result.conversation_count,
        memoryItems: result.memory_item_count,
      },
    });
  } catch (error) {
    console.error('Workspace DELETE route error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

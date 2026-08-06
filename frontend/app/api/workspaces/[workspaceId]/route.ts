import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import {
  mapWorkspaceRow,
  type WorkspaceListItem,
} from '@/lib/workspaces';
import {
  deleteWorkspaceForCurrentUser,
  updateWorkspaceForCurrentUser,
} from '@/app/workspaces/[workspaceId]/server-mutations';

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
    const body = await readJsonObject(request);
    const result = await updateWorkspaceForCurrentUser(workspaceId, body);
    if (result.status === 'error') {
      return NextResponse.json(
        { error: result.error },
        { status: result.statusCode }
      );
    }

    return NextResponse.json({ workspace: result.workspace });
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
    const result = await deleteWorkspaceForCurrentUser(workspaceId);
    if (result.status === 'error') {
      return NextResponse.json(
        { error: result.error },
        { status: result.statusCode }
      );
    }

    return NextResponse.json({
      success: true,
      deleted: {
        workspace: 1,
        conversations: result.conversations,
      },
    });
  } catch (error) {
    console.error('Workspace DELETE route error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

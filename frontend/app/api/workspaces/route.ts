import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import {
  mapWorkspaceRow,
  mapWorkspaceSummary,
  sanitizeWorkspaceAccentColor,
  sanitizeWorkspaceContext,
  sanitizeWorkspaceDescription,
  sanitizeWorkspaceIcon,
  sanitizeWorkspaceName,
  type WorkspaceListItem,
  type WorkspaceSummary,
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

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const user = await getAuthenticatedUser(supabase);

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('workspaces')
      .select('id, name, description, icon, accent_color, created_at, updated_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('Workspaces GET error:', error);
      return NextResponse.json({ error: 'Failed to load workspaces' }, { status: 500 });
    }

    return NextResponse.json({
      workspaces: ((data || []) as WorkspaceSummary[]).map(mapWorkspaceSummary),
    });
  } catch (error) {
    console.error('Workspaces GET route error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const user = await getAuthenticatedUser(supabase);

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await readJsonObject(request);
    if (!body) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const name = sanitizeWorkspaceName(body.name);
    if (!name) {
      return NextResponse.json({ error: 'Workspace name is required' }, { status: 400 });
    }

    const insertBody = {
      user_id: user.id,
      name,
      description: sanitizeWorkspaceDescription(body.description),
      context: sanitizeWorkspaceContext(body.context),
      icon: sanitizeWorkspaceIcon(body.icon),
      accent_color: sanitizeWorkspaceAccentColor(body.accent_color),
    };

    const { data, error } = await supabase
      .from('workspaces')
      .insert(insertBody)
      .select('id, name, description, context, icon, accent_color, created_at, updated_at')
      .single();

    if (error || !data) {
      console.error('Workspace POST error:', error);
      return NextResponse.json({ error: 'Failed to create workspace' }, { status: 500 });
    }

    return NextResponse.json(
      { workspace: mapWorkspaceRow(data as WorkspaceListItem) },
      { status: 201 }
    );
  } catch (error) {
    console.error('Workspaces POST route error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

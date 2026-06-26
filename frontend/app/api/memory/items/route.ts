import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import {
  parseMemoryScope,
  parseMentorScope,
  parseWorkspaceScope,
  type MemoryStatus,
} from '@/lib/memory-items';

const ALLOWED_STATUS: MemoryStatus[] = ['active', 'superseded', 'deleted'];

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

export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const user = await getAuthenticatedUser(supabase);

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const scope = parseMemoryScope(searchParams.get('scope'));

    const statusParam = searchParams.get('status');
    const status = statusParam && ALLOWED_STATUS.includes(statusParam as MemoryStatus)
      ? (statusParam as MemoryStatus)
      : 'active';

    let query = supabase
      .from('memory_items')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', status)
      .order('updated_at', { ascending: false })
      .limit(300);

    if (scope === 'global') {
      query = query.eq('owner_type', 'global').is('owner_id', null);
    } else if (scope.startsWith('mentor:')) {
      const mentorId = parseMentorScope(scope);
      if (!mentorId) {
        return NextResponse.json({ error: 'Invalid mentor scope' }, { status: 400 });
      }
      query = query.eq('owner_type', 'mentor').eq('owner_id', mentorId);
    } else if (scope.startsWith('workspace:')) {
      const workspaceId = parseWorkspaceScope(scope);
      if (!workspaceId) {
        return NextResponse.json({ error: 'Invalid workspace scope' }, { status: 400 });
      }

      const { data: workspace, error: workspaceError } = await supabase
        .from('workspaces')
        .select('id')
        .eq('id', workspaceId)
        .eq('user_id', user.id)
        .single();

      if (workspaceError || !workspace) {
        return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
      }

      query = query.eq('owner_type', 'workspace').eq('owner_id', workspaceId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Memory items GET error:', error);
      return NextResponse.json({ error: 'Failed to load memory items' }, { status: 500 });
    }

    return NextResponse.json({ items: data || [] });
  } catch (error) {
    console.error('Memory items GET route error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

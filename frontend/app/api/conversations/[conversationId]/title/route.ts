import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const { conversationId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as {
    title?: unknown;
    expectedVersion?: unknown;
  } | null;
  const title = typeof body?.title === 'string' ? body.title.replace(/\s+/g, ' ').trim() : '';
  if (!title || title.length > 80) {
    return NextResponse.json(
      { error: 'Title must be between 1 and 80 characters' },
      { status: 400 }
    );
  }

  const { data: conversation, error: lookupError } = await supabase
    .from('conversations')
    .select('id, title_version')
    .eq('id', conversationId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (lookupError) {
    return NextResponse.json(
      { error: 'Failed to load conversation' },
      { status: 500 }
    );
  }
  if (!conversation) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }
  const currentVersion = Number(conversation.title_version) || 0;
  if (
    typeof body?.expectedVersion === 'number'
    && body.expectedVersion !== currentVersion
  ) {
    return NextResponse.json(
      { error: 'The title changed before this edit was saved', code: 'stale_title' },
      { status: 409 }
    );
  }

  const nextVersion = currentVersion + 1;
  const { data: updatedTitle, error } = await supabase
    .from('conversations')
    .update({
      title,
      title_source: 'user',
      title_version: nextVersion,
      title_run_id: null,
    })
    .eq('id', conversationId)
    .eq('user_id', user.id)
    .eq('title_version', currentVersion)
    .select('title, title_source, title_version')
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: 'Failed to update title' }, { status: 500 });
  }
  if (!updatedTitle) {
    return NextResponse.json(
      { error: 'The title changed before this edit was saved', code: 'stale_title' },
      { status: 409 }
    );
  }
  return NextResponse.json({
    title: { value: title, source: 'user', version: nextVersion },
  });
}

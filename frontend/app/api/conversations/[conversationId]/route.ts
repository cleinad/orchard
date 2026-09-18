import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';

function parseDeleteResult(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const result = value as Record<string, unknown>;
  if (
    typeof result.conversation_deleted !== 'boolean'
    || !Array.isArray(result.storage_paths)
  ) {
    return null;
  }
  return {
    deleted: result.conversation_deleted,
    storagePaths: result.storage_paths.filter((path): path is string => typeof path === 'string'),
  };
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const { conversationId } = await params;
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase.rpc('delete_conversation_cascade', {
      p_conversation_id: conversationId,
    });
    if (error) {
      console.error('Conversation delete RPC error:', error);
      return NextResponse.json({ error: 'Failed to delete chat' }, { status: 500 });
    }

    const result = parseDeleteResult(data);
    if (!result) {
      console.error('Conversation delete RPC returned an unexpected payload');
      return NextResponse.json({ error: 'Failed to delete chat' }, { status: 500 });
    }
    if (!result.deleted) {
      return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
    }

    if (result.storagePaths.length > 0) {
      try {
        const { error: storageError } = await supabase.storage
          .from('chat-images')
          .remove(result.storagePaths);
        if (storageError) console.error('Conversation storage cleanup after delete error:', storageError);
      } catch (storageError) {
        console.error('Conversation storage cleanup after delete error:', storageError);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Conversation DELETE route error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

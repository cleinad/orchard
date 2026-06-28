import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';

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

function normalizeWorkspaceId(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeMemoryPolicy(value: unknown): 'conservative' | undefined {
  if (value === undefined || value === null || value === 'conservative') {
    return 'conservative';
  }

  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { conversationId } = await params;
    const normalizedConversationId = conversationId?.trim();
    if (!normalizedConversationId) {
      return NextResponse.json({ error: 'conversationId is required' }, { status: 400 });
    }

    const body = await readJsonObject(request);
    if (!body) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const workspaceId = normalizeWorkspaceId(body.workspaceId);
    if (workspaceId === undefined) {
      return NextResponse.json({ error: 'workspaceId must be a string or null' }, { status: 400 });
    }

    const memoryPolicy = normalizeMemoryPolicy(body.memoryPolicy);
    if (!memoryPolicy) {
      return NextResponse.json({ error: 'Unsupported memory policy' }, { status: 400 });
    }

    const { data, error } = await supabase.rpc('move_conversation_context', {
      p_conversation_id: normalizedConversationId,
      p_workspace_id: workspaceId,
      p_memory_policy: memoryPolicy,
    });

    if (error) {
      console.error('Failed to move conversation context:', error);
      return NextResponse.json({ error: 'Failed to move conversation' }, { status: 500 });
    }

    if (!isRecord(data)) {
      return NextResponse.json({ error: 'Failed to move conversation' }, { status: 500 });
    }

    if (data.conversation_found === false) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    if (data.target_workspace_found === false) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    }

    if (data.error === 'mentor_context_unsupported') {
      return NextResponse.json(
        { error: 'Mentor conversations cannot be moved yet' },
        { status: 400 }
      );
    }

    if (data.error === 'noop') {
      return NextResponse.json(
        { error: 'Conversation is already in that context' },
        { status: 409 }
      );
    }

    if (data.error) {
      return NextResponse.json({ error: 'Failed to move conversation' }, { status: 500 });
    }

    const conversation = isRecord(data.conversation) ? data.conversation : null;
    const memory = isRecord(data.memory) ? data.memory : {};
    if (!conversation || typeof conversation.id !== 'string') {
      return NextResponse.json({ error: 'Failed to move conversation' }, { status: 500 });
    }

    return NextResponse.json({
      conversation: {
        id: conversation.id,
        title: typeof conversation.title === 'string' ? conversation.title : null,
        mentorId: typeof conversation.mentor_id === 'string' ? conversation.mentor_id : null,
        workspaceId:
          typeof conversation.workspace_id === 'string' ? conversation.workspace_id : null,
        createdAt:
          typeof conversation.created_at === 'string' ? conversation.created_at : null,
        updatedAt:
          typeof conversation.updated_at === 'string' ? conversation.updated_at : null,
      },
      memory: {
        moved: typeof memory.moved === 'number' ? memory.moved : 0,
        copied: typeof memory.copied === 'number' ? memory.copied : 0,
        leftInPlace: typeof memory.leftInPlace === 'number' ? memory.leftInPlace : 0,
      },
    });
  } catch (error) {
    console.error('Error moving conversation context:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

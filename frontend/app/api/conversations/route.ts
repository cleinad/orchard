import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { fallbackChatTitleFromMessage } from '@/lib/chat-session';

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

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await readJsonObject(request);
    if (!body) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const initialMessage =
      body.initialMessage === undefined
        ? ''
        : body.initialMessage;

    if (typeof initialMessage !== 'string') {
      return NextResponse.json({ error: 'initialMessage must be a string' }, { status: 400 });
    }

    const rawMentorId = body.mentorId;
    if (
      rawMentorId !== undefined
      && rawMentorId !== null
      && typeof rawMentorId !== 'string'
    ) {
      return NextResponse.json({ error: 'mentorId must be a string' }, { status: 400 });
    }

    const mentorId =
      typeof rawMentorId === 'string' && rawMentorId.trim().length > 0
        ? rawMentorId.trim()
        : null;

    const rawWorkspaceId = body.workspaceId;
    if (
      rawWorkspaceId !== undefined
      && rawWorkspaceId !== null
      && typeof rawWorkspaceId !== 'string'
    ) {
      return NextResponse.json({ error: 'workspaceId must be a string' }, { status: 400 });
    }

    const workspaceId =
      typeof rawWorkspaceId === 'string' && rawWorkspaceId.trim().length > 0
        ? rawWorkspaceId.trim()
        : null;

    if (mentorId && workspaceId) {
      return NextResponse.json(
        { error: 'A conversation cannot have both a mentor and a workspace' },
        { status: 400 }
      );
    }

    if (mentorId) {
      const { data: mentor, error: mentorError } = await supabase
        .from('mentors')
        .select('id')
        .eq('id', mentorId)
        .eq('user_id', user.id)
        .single();

      if (mentorError || !mentor) {
        return NextResponse.json({ error: 'Mentor not found' }, { status: 404 });
      }
    }

    if (workspaceId) {
      const { data: workspace, error: workspaceError } = await supabase
        .from('workspaces')
        .select('id')
        .eq('id', workspaceId)
        .eq('user_id', user.id)
        .single();

      if (workspaceError || !workspace) {
        return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
      }
    }

    const title = fallbackChatTitleFromMessage(initialMessage);
    const { data: conversation, error: conversationError } = await supabase
      .from('conversations')
      .insert({
        user_id: user.id,
        title,
        mentor_id: mentorId,
        workspace_id: workspaceId,
      })
      .select('id, title, mentor_id, workspace_id, created_at, updated_at')
      .single();

    if (conversationError || !conversation) {
      console.error('Failed to create conversation:', conversationError);
      return NextResponse.json(
        { error: 'Failed to create conversation' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        conversation: {
          id: conversation.id,
          title: conversation.title,
          mentorId: conversation.mentor_id,
          workspaceId: conversation.workspace_id,
          createdAt: conversation.created_at,
          updatedAt: conversation.updated_at,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating conversation:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await readJsonObject(request);
    if (!body) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const conversationId =
      typeof body.conversationId === 'string' ? body.conversationId.trim() : '';

    if (!conversationId) {
      return NextResponse.json(
        { error: 'conversationId is required' },
        { status: 400 }
      );
    }

    const { data: message } = await supabase
      .from('messages')
      .select('id')
      .eq('conversation_id', conversationId)
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();

    if (message) {
      return NextResponse.json(
        { error: 'Conversation is not empty' },
        { status: 409 }
      );
    }

    const { error: deleteError } = await supabase
      .from('conversations')
      .delete()
      .eq('id', conversationId)
      .eq('user_id', user.id);

    if (deleteError) {
      console.error('Failed to delete empty conversation:', deleteError);
      return NextResponse.json(
        { error: 'Failed to delete conversation' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting empty conversation:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

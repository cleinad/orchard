import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  try {
    const { threadId } = await params;
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: thread, error: threadError } = await supabase
      .from("threads")
      .select(
        "id, conversation_id, source_message_id, highlighted_text, start_offset, end_offset, selection_stream_version"
      )
      .eq("id", threadId)
      .eq("user_id", user.id)
      .single();

    if (threadError || !thread) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    const { data: messages, error: messagesError } = await supabase
      .from("messages")
      .select("id, role, content, created_at, search_metadata")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });

    if (messagesError) {
      return NextResponse.json({ error: messagesError.message }, { status: 500 });
    }

    return NextResponse.json({
      thread: {
        threadId: thread.id,
        conversationId: thread.conversation_id,
        sourceMessageId: thread.source_message_id,
        highlightedText: thread.highlighted_text,
        startOffset: thread.start_offset,
        endOffset: thread.end_offset,
        selectionStreamVersion: thread.selection_stream_version,
      },
      messages: messages || [],
    });
  } catch (error) {
    console.error("Thread messages API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

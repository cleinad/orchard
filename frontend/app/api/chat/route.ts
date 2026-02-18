import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { generateText } from 'ai';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { loadMemoryContext } from '@/lib/memory-reader';
import { processMemory } from '@/lib/memory-agent';
import { CHAT_MODEL } from '@/lib/models';

const BASE_SYSTEM_PROMPT = `You are Novus, a voice-native thinking partner. You help the user think through problems with depth, capture their thoughts, and stay on top of their commitments.

Core traits:
- You think WITH the user, not just respond to them. Ask probing questions, challenge assumptions, help them get to the bottom of things.
- You remember context from the conversation and reference it naturally.
- You're concise but substantive. No fluff, no generic advice. Go deep.
- You extract and track commitments, action items, and key ideas without being asked.
- You speak like a thoughtful friend who happens to have excellent memory - warm but direct.

When the user is:
- EXPLORING a topic: Ask "why" questions, surface tradeoffs, help them think it through
- CAPTURING thoughts: Acknowledge, organize, and confirm what you understood
- MANAGING tasks: Be proactive about priorities, follow up on commitments

Keep responses conversational and focused. This is a voice conversation - avoid walls of text, bullet dumps, or overly formal language.
When appropriate, answer questions directly without snarky validation or introductions. You can be more direct and less summarative at times because this is a conversation with a human.
Exercise your judgement on when to be more direct and when to be more conversational, you are to be an excellent communicator.`;

function buildSystemPrompt(memoryContext: string): string {
  if (!memoryContext.trim()) return BASE_SYSTEM_PROMPT;

  return `${BASE_SYSTEM_PROMPT}

You have memory about this user from previous conversations. Use it naturally — reference what you know as if you simply remember. Never announce that you are reading from memory or mention your memory system.

<user_memory>
${memoryContext}
</user_memory>`;
}

interface ChatRequest {
  message: string;
  conversationId?: string;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();

    // Get current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: ChatRequest = await request.json();
    const { message, conversationId } = body;

    if (!message?.trim()) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    let activeConversationId = conversationId;

    // Create new conversation if none provided
    if (!activeConversationId) {
      const { data: conversation, error: convError } = await supabase
        .from('conversations')
        .insert({ user_id: user.id, title: message.slice(0, 100) })
        .select('id')
        .single();

      if (convError) {
        console.error('Error creating conversation:', convError);
        return NextResponse.json(
          { error: 'Failed to create conversation' },
          { status: 500 }
        );
      }

      activeConversationId = conversation.id;
    }

    // Save user message
    const { error: userMsgError } = await supabase.from('messages').insert({
      conversation_id: activeConversationId,
      user_id: user.id,
      role: 'user',
      content: message,
    });

    if (userMsgError) {
      console.error('Error saving user message:', userMsgError);
    }

    // Fetch conversation history for context
    const { data: history } = await supabase
      .from('messages')
      .select('role, content')
      .eq('conversation_id', activeConversationId)
      .order('created_at', { ascending: true })
      .limit(50);

    const messages = history || [{ role: 'user', content: message }];

    // Load memory context and build system prompt
    const memoryContext = await loadMemoryContext(supabase, user.id);
    const systemPrompt = buildSystemPrompt(memoryContext);

    // Call LLM via Vercel AI SDK
    const { text: assistantResponse } = await generateText({
      model: CHAT_MODEL,
      system: systemPrompt,
      messages: messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    });

    // Save assistant message
    const { error: assistantMsgError } = await supabase.from('messages').insert({
      conversation_id: activeConversationId,
      user_id: user.id,
      role: 'assistant',
      content: assistantResponse,
    });

    if (assistantMsgError) {
      console.error('Error saving assistant message:', assistantMsgError);
    }

    // Fire background memory agent (runs after response is sent)
    after(async () => {
      try {
        await processMemory(user.id, messages, assistantResponse);
      } catch (err) {
        console.error('[Memory Agent] Error:', err);
      }
    });

    return NextResponse.json({
      message: assistantResponse,
      conversationId: activeConversationId,
    });
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { loadMemoryContext } from '@/lib/memory-reader';
import { processMemory } from '@/lib/memory-agent';

// LLM Provider configuration
const LLM_PROVIDER = process.env.LLM_PROVIDER || 'anthropic';
const LLM_API_KEY = process.env.LLM_API_KEY || '';
const LLM_MODEL = process.env.LLM_MODEL || getDefaultModel(LLM_PROVIDER);

function getDefaultModel(provider: string): string {
  switch (provider.toLowerCase()) {
    case 'gemini':
      return 'gemini-2.0-flash';
    case 'openai':
      return 'gpt-4o';
    case 'anthropic':
      return 'claude-sonnet-4-20250514';
    default:
      return 'claude-sonnet-4-20250514';
  }
}

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
  threadId?: string;
}

async function callGemini(messages: { role: string; content: string }[], systemPrompt: string): Promise<string> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${LLM_MODEL}:generateContent?key=${LLM_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: messages.map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        })),
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${error}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated';
}

async function callOpenAI(messages: { role: string; content: string }[], systemPrompt: string): Promise<string> {
  const messagesWithSystem = [
    { role: 'system', content: systemPrompt },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${LLM_API_KEY}`,
    },
    body: JSON.stringify({
      model: LLM_MODEL,
      messages: messagesWithSystem,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${error}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || 'No response generated';
}

async function callAnthropic(messages: { role: string; content: string }[], systemPrompt: string): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': LLM_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: LLM_MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error: ${error}`);
  }

  const data = await response.json();
  return data.content?.[0]?.text || 'No response generated';
}

async function callLLM(messages: { role: string; content: string }[], systemPrompt: string): Promise<string> {
  switch (LLM_PROVIDER.toLowerCase()) {
    case 'gemini':
      return callGemini(messages, systemPrompt);
    case 'openai':
      return callOpenAI(messages, systemPrompt);
    case 'anthropic':
      return callAnthropic(messages, systemPrompt);
    default:
      throw new Error(`Unknown LLM provider: ${LLM_PROVIDER}`);
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!LLM_API_KEY) {
      return NextResponse.json(
        { error: 'LLM API key not configured' },
        { status: 500 }
      );
    }

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

    // Call LLM
    const assistantResponse = await callLLM(messages, systemPrompt);

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

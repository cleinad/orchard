import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { generateText, stepCountIs } from 'ai';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { loadMemoryContextV2 } from '@/lib/memory-reader';
import { processMemoryV2 } from '@/lib/memory-agent';
import { CHAT_MODEL } from '@/lib/models';
import {
  addSearchInstructions,
  applySearchDisclosure,
  extractSearchMetadata,
  type SearchMode,
} from '@/lib/chat-search';
import { webSearch } from '@/lib/tools';
import { buildMentorPrompt } from '@/lib/mentors/prompts';

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

function buildMentorSystemPrompt(basePrompt: string, memoryContext: string): string {
  if (!memoryContext.trim()) return basePrompt;

  return `${basePrompt}

Use the user's memory naturally. Keep it implicit and never mention a memory system.

<user_memory>
${memoryContext}
</user_memory>`;
}

interface ChatRequest {
  message: string;
  conversationId?: string;
  mentorId?: string;
  searchEnabled?: boolean;
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
    const { message, conversationId, mentorId, searchEnabled = false } = body;

    if (!message?.trim()) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    let activeConversationId = conversationId;

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .maybeSingle();

    let mentor: {
      id: string;
      base_system_prompt: string;
      user_instructions: string;
      model_id: string | null;
    } | null = null;

    if (mentorId) {
      const { data: mentorRow, error: mentorError } = await supabase
        .from('mentors')
        .select('id, base_system_prompt, user_instructions, model_id')
        .eq('id', mentorId)
        .eq('user_id', user.id)
        .single();

      if (mentorError || !mentorRow) {
        return NextResponse.json({ error: 'Mentor not found' }, { status: 404 });
      }

      mentor = mentorRow;
    }

    // Validate an existing conversation, and infer mentor context when possible.
    if (activeConversationId) {
      const { data: existingConversation, error: conversationError } = await supabase
        .from('conversations')
        .select('id, mentor_id')
        .eq('id', activeConversationId)
        .eq('user_id', user.id)
        .single();

      if (conversationError || !existingConversation) {
        return NextResponse.json(
          { error: 'Conversation not found' },
          { status: 404 }
        );
      }

      if (mentor && existingConversation.mentor_id !== mentor.id) {
        return NextResponse.json(
          { error: 'Conversation does not match the selected mentor' },
          { status: 400 }
        );
      }

      if (!mentor && existingConversation.mentor_id) {
        const { data: mentorFromConversation } = await supabase
          .from('mentors')
          .select('id, base_system_prompt, user_instructions, model_id')
          .eq('id', existingConversation.mentor_id)
          .eq('user_id', user.id)
          .maybeSingle();

        if (mentorFromConversation) {
          mentor = mentorFromConversation;
        }
      }
    }

    // Create or reuse conversation when none is provided.
    if (!activeConversationId) {
      if (mentor) {
        const { data: existingMentorConversation } = await supabase
          .from('conversations')
          .select('id')
          .eq('user_id', user.id)
          .eq('mentor_id', mentor.id)
          .maybeSingle();

        if (existingMentorConversation) {
          activeConversationId = existingMentorConversation.id;
        } else {
          const { data: conversation, error: convError } = await supabase
            .from('conversations')
            .insert({
              user_id: user.id,
              title: message.slice(0, 100),
              mentor_id: mentor.id,
            })
            .select('id')
            .single();

          if (convError || !conversation) {
            // Another request may have created it first (unique index on user_id + mentor_id).
            if (convError?.code === '23505') {
              const { data: retriedConversation } = await supabase
                .from('conversations')
                .select('id')
                .eq('user_id', user.id)
                .eq('mentor_id', mentor.id)
                .maybeSingle();

              if (retriedConversation) {
                activeConversationId = retriedConversation.id;
              }
            }

            if (!activeConversationId) {
              console.error('Error creating mentor conversation:', convError);
              return NextResponse.json(
                { error: 'Failed to create conversation' },
                { status: 500 }
              );
            }
          }

          if (conversation?.id) {
            activeConversationId = conversation.id;
          }
        }
      } else {
        const { data: conversation, error: convError } = await supabase
          .from('conversations')
          .insert({ user_id: user.id, title: message.slice(0, 100) })
          .select('id')
          .single();

        if (convError || !conversation) {
          console.error('Error creating conversation:', convError);
          return NextResponse.json(
            { error: 'Failed to create conversation' },
            { status: 500 }
          );
        }

        activeConversationId = conversation.id;
      }
    }

    // Save user message
    const { data: userMessageRow, error: userMsgError } = await supabase
      .from('messages')
      .insert({
        conversation_id: activeConversationId,
        user_id: user.id,
        role: 'user',
        content: message,
      })
      .select('id')
      .single();

    if (userMsgError) {
      console.error('Error saving user message:', userMsgError);
    }

    const latestUserMessageId = userMessageRow?.id ?? null;

    // Fetch conversation history for context
    const { data: history } = await supabase
      .from('messages')
      .select('role, content')
      .eq('conversation_id', activeConversationId)
      .order('created_at', { ascending: true })
      .limit(50);

    const messages = history || [{ role: 'user', content: message }];

    const isMentorConversation = !!mentor;

    const memoryContext = await loadMemoryContextV2(supabase, user.id, {
      actor: isMentorConversation ? 'mentor' : 'novus',
      mentorId: mentor?.id ?? null,
      query: message,
      tokenBudget: isMentorConversation ? 900 : 1100,
      maxItems: isMentorConversation ? 24 : 30,
    });

    const searchMode: SearchMode = searchEnabled ? 'required' : 'auto';

    // Build Novus or mentor system prompt.
    const baseSystemPrompt = isMentorConversation
      ? buildMentorSystemPrompt(
          buildMentorPrompt(mentor!, profile?.full_name || ''),
          memoryContext
        )
      : buildSystemPrompt(memoryContext);
    const systemPrompt = addSearchInstructions(baseSystemPrompt, searchMode);

    // Call LLM via Vercel AI SDK (agentic loop with tools)
    const generation = await generateText({
      model: CHAT_MODEL,
      system: systemPrompt,
      messages: messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      tools: { webSearch },
      toolChoice:
        searchMode === 'required'
          ? { type: 'tool' as const, toolName: 'webSearch' }
          : 'auto',
      stopWhen: stepCountIs(5),
    });
    const search = extractSearchMetadata(generation, searchMode);
    const assistantResponse = applySearchDisclosure(generation.text, search);

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

    after(async () => {
      try {
        await processMemoryV2(user.id, messages, assistantResponse, {
          conversationId: activeConversationId,
          mentorId: mentor?.id ?? null,
          sourceMessageId: latestUserMessageId,
          sourceRole: 'user',
        });
      } catch (err) {
        console.error('[Memory V2] Error:', err);
      }
    });

    return NextResponse.json({
      message: assistantResponse,
      conversationId: activeConversationId,
      mentorId: mentor?.id ?? null,
      search,
    });
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

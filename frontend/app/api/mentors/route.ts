import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import {
  ensureUniqueSlug,
  isAvatarUrlOwnedByUser,
  normalizeAccentColor,
  sanitizeDescription,
  sanitizeMentorName,
  sanitizePrompt,
  sanitizeTagline,
  syncBuiltInMentors,
} from '@/lib/mentors/server';

const CreateMentorSchema = z.object({
  name: z.string().min(1).max(80),
  tagline: z.string().min(1).max(160),
  description: z.string().max(2000).optional().nullable(),
  base_system_prompt: z.string().min(1).max(12000),
  accent_color: z.string().optional().nullable(),
  avatar_url: z.string().url().optional().nullable(),
});

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

    await syncBuiltInMentors(supabase, user.id);

    const { data: mentors, error: mentorsError } = await supabase
      .from('mentors')
      .select(
        'id, slug, name, tagline, description, is_builtin, accent_color, avatar_url'
      )
      .eq('user_id', user.id);

    if (mentorsError) {
      return NextResponse.json({ error: mentorsError.message }, { status: 500 });
    }

    const { data: conversations, error: conversationsError } = await supabase
      .from('conversations')
      .select('id, mentor_id, updated_at')
      .eq('user_id', user.id)
      .not('mentor_id', 'is', null);

    if (conversationsError) {
      return NextResponse.json({ error: conversationsError.message }, { status: 500 });
    }

    const conversationByMentor = new Map<
      string,
      { id: string; updated_at: string }
    >();
    for (const conversation of conversations || []) {
      if (!conversation.mentor_id) continue;
      conversationByMentor.set(conversation.mentor_id, {
        id: conversation.id,
        updated_at: conversation.updated_at,
      });
    }

    const withConversation = (mentors || []).map((mentor) => {
      const conversation = conversationByMentor.get(mentor.id);
      return {
        ...mentor,
        conversation_id: conversation?.id ?? null,
        conversation_updated_at: conversation?.updated_at ?? null,
      };
    });

    const active = withConversation
      .filter((mentor) => mentor.conversation_id)
      .sort((a, b) => {
        const aTime = a.conversation_updated_at
          ? new Date(a.conversation_updated_at).getTime()
          : 0;
        const bTime = b.conversation_updated_at
          ? new Date(b.conversation_updated_at).getTime()
          : 0;
        return bTime - aTime;
      });

    const inactive = withConversation
      .filter((mentor) => !mentor.conversation_id)
      .sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json([...active, ...inactive]);
  } catch (error) {
    console.error('Mentors GET error:', error);
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

    await syncBuiltInMentors(supabase, user.id);

    const parsed = CreateMentorSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const payload = parsed.data;
    const accentColor = normalizeAccentColor(payload.accent_color);

    if (payload.accent_color && !accentColor) {
      return NextResponse.json(
        { error: 'accent_color must be a hex value like #4A90D9' },
        { status: 400 }
      );
    }

    if (payload.avatar_url && !isAvatarUrlOwnedByUser(payload.avatar_url, user.id)) {
      return NextResponse.json(
        { error: 'avatar_url must point to your own mentor avatar upload' },
        { status: 400 }
      );
    }

    const slug = await ensureUniqueSlug(supabase, user.id, payload.name);

    const insertBody = {
      user_id: user.id,
      slug,
      name: sanitizeMentorName(payload.name),
      tagline: sanitizeTagline(payload.tagline),
      description: sanitizeDescription(payload.description || ''),
      base_system_prompt: sanitizePrompt(payload.base_system_prompt),
      user_instructions: '',
      is_builtin: false,
      accent_color: accentColor,
      avatar_url: payload.avatar_url ?? null,
    };

    const { data, error } = await supabase
      .from('mentors')
      .insert(insertBody)
      .select(
        'id, slug, name, tagline, description, base_system_prompt, user_instructions, is_builtin, accent_color, avatar_url, voice_id, model_id, created_at, updated_at'
      )
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('Mentors POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

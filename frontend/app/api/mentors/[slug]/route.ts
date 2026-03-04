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

const BuiltInPatchSchema = z
  .object({
    user_instructions: z.string().max(8000).optional(),
    accent_color: z.string().nullable().optional(),
    avatar_url: z.string().url().nullable().optional(),
  })
  .strict();

const CustomPatchSchema = z
  .object({
    name: z.string().min(1).max(80).optional(),
    tagline: z.string().min(1).max(160).optional(),
    description: z.string().max(2000).nullable().optional(),
    base_system_prompt: z.string().min(1).max(12000).optional(),
    user_instructions: z.string().max(8000).optional(),
    accent_color: z.string().nullable().optional(),
    avatar_url: z.string().url().nullable().optional(),
  })
  .strict();

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

export async function GET(
  _request: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const { slug } = params;
    const supabase = await createSupabaseServerClient();
    const user = await getAuthenticatedUser(supabase);

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await syncBuiltInMentors(supabase, user.id);

    const { data: mentor, error } = await supabase
      .from('mentors')
      .select('*')
      .eq('user_id', user.id)
      .eq('slug', slug)
      .single();

    if (error || !mentor) {
      return NextResponse.json({ error: 'Mentor not found' }, { status: 404 });
    }

    const { data: conversation } = await supabase
      .from('conversations')
      .select('id')
      .eq('user_id', user.id)
      .eq('mentor_id', mentor.id)
      .maybeSingle();

    return NextResponse.json({
      ...mentor,
      base_system_prompt: mentor.is_builtin ? null : mentor.base_system_prompt,
      conversation_id: conversation?.id ?? null,
    });
  } catch (error) {
    console.error('Mentor detail GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const { slug } = params;
    const supabase = await createSupabaseServerClient();
    const user = await getAuthenticatedUser(supabase);

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: mentor, error: fetchError } = await supabase
      .from('mentors')
      .select('*')
      .eq('user_id', user.id)
      .eq('slug', slug)
      .single();

    if (fetchError || !mentor) {
      return NextResponse.json({ error: 'Mentor not found' }, { status: 404 });
    }

    const body = await request.json();
    const parsed = mentor.is_builtin
      ? BuiltInPatchSchema.safeParse(body)
      : CustomPatchSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const input = parsed.data;
    if (Object.keys(input).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const updateBody: Record<string, unknown> = {};

    if ('user_instructions' in input && typeof input.user_instructions === 'string') {
      updateBody.user_instructions = input.user_instructions.trim().slice(0, 8000);
    }

    if ('accent_color' in input) {
      if (input.accent_color === null) {
        updateBody.accent_color = null;
      } else {
        const accentColor = normalizeAccentColor(input.accent_color);
        if (!accentColor) {
          return NextResponse.json(
            { error: 'accent_color must be a hex value like #4A90D9' },
            { status: 400 }
          );
        }
        updateBody.accent_color = accentColor;
      }
    }

    if ('avatar_url' in input) {
      if (input.avatar_url === null) {
        updateBody.avatar_url = null;
      } else if (
        typeof input.avatar_url === 'string' &&
        !isAvatarUrlOwnedByUser(input.avatar_url, user.id)
      ) {
        return NextResponse.json(
          { error: 'avatar_url must point to your own mentor avatar upload' },
          { status: 400 }
        );
      } else if (typeof input.avatar_url !== 'string') {
        return NextResponse.json(
          { error: 'avatar_url must be a URL string or null' },
          { status: 400 }
        );
      } else {
        updateBody.avatar_url = input.avatar_url;
      }
    }

    if (!mentor.is_builtin) {
      if ('name' in input && typeof input.name === 'string') {
        const nextName = sanitizeMentorName(input.name);
        updateBody.name = nextName;
        if (nextName !== mentor.name) {
          updateBody.slug = await ensureUniqueSlug(
            supabase,
            user.id,
            nextName,
            mentor.id
          );
        }
      }
      if ('tagline' in input && typeof input.tagline === 'string') {
        updateBody.tagline = sanitizeTagline(input.tagline);
      }
      if ('description' in input) {
        if (typeof input.description === 'string') {
          updateBody.description = sanitizeDescription(input.description);
        } else {
          updateBody.description = null;
        }
      }
      if (
        'base_system_prompt' in input &&
        typeof input.base_system_prompt === 'string'
      ) {
        updateBody.base_system_prompt = sanitizePrompt(input.base_system_prompt);
      }
    }

    if (Object.keys(updateBody).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const { data: updated, error: updateError } = await supabase
      .from('mentors')
      .update(updateBody)
      .eq('id', mentor.id)
      .eq('user_id', user.id)
      .select('*')
      .single();

    if (updateError || !updated) {
      return NextResponse.json(
        { error: updateError?.message || 'Failed to update mentor' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ...updated,
      base_system_prompt: updated.is_builtin ? null : updated.base_system_prompt,
    });
  } catch (error) {
    console.error('Mentor PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const { slug } = params;
    const supabase = await createSupabaseServerClient();
    const user = await getAuthenticatedUser(supabase);

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: mentor, error: fetchError } = await supabase
      .from('mentors')
      .select('id, is_builtin')
      .eq('user_id', user.id)
      .eq('slug', slug)
      .single();

    if (fetchError || !mentor) {
      return NextResponse.json({ error: 'Mentor not found' }, { status: 404 });
    }

    if (mentor.is_builtin) {
      return NextResponse.json(
        { error: 'Built-in mentors cannot be deleted' },
        { status: 403 }
      );
    }

    const { error: deleteConversationError } = await supabase
      .from('conversations')
      .delete()
      .eq('user_id', user.id)
      .eq('mentor_id', mentor.id);

    if (deleteConversationError) {
      return NextResponse.json(
        { error: deleteConversationError.message },
        { status: 500 }
      );
    }

    const { error: deleteMentorError } = await supabase
      .from('mentors')
      .delete()
      .eq('id', mentor.id)
      .eq('user_id', user.id);

    if (deleteMentorError) {
      return NextResponse.json({ error: deleteMentorError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Mentor DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

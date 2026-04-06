import { NextRequest, NextResponse } from 'next/server';
import { generateObject } from 'ai';
import { z } from 'zod';
import { getChatModel } from '@/lib/models';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import {
  sanitizeDescription,
  sanitizeMentorName,
  sanitizePrompt,
  sanitizeTagline,
} from '@/lib/mentors/server';

const GenerateSchema = z.object({
  prompt: z.string().min(8).max(2000),
});

const GeneratedMentorSchema = z.object({
  name: z.string().min(1).max(80),
  tagline: z.string().min(1).max(160),
  description: z.string().min(1).max(2000),
  base_system_prompt: z.string().min(200).max(12000),
});

const MENTOR_GENERATOR_SYSTEM_PROMPT = `You are a mentor persona designer for Keen.
You convert a user's natural-language request into a high-quality, production-ready mentor definition.

Output must include:
- name
- tagline
- description
- base_system_prompt

Rules for base_system_prompt:
- Keep the mentor grounded, specific, and practical.
- Include communication style, approach, and constraints.
- Make the mentor ask clarifying questions before prescribing solutions.
- Include "You must" and "You must not" sections with concrete guardrails.
- Keep wording suitable for a voice-first conversation app.
- Never mention internal implementation details or JSON.

Do not output generic fluff.`;

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

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const user = await getAuthenticatedUser(supabase);

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const parsed = GenerateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { object } = await generateObject({
      model: getChatModel(),
      system: MENTOR_GENERATOR_SYSTEM_PROMPT,
      prompt: `User request:\n${parsed.data.prompt.trim()}`,
      schema: GeneratedMentorSchema,
    });

    return NextResponse.json({
      name: sanitizeMentorName(object.name),
      tagline: sanitizeTagline(object.tagline),
      description: sanitizeDescription(object.description),
      base_system_prompt: sanitizePrompt(object.base_system_prompt),
    });
  } catch (error) {
    console.error('Mentors generate POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  clampConfidence,
  clampSalience,
  MEMORY_SENSITIVITIES,
  MEMORY_STABILITIES,
  MEMORY_STATUSES,
  normalizeMemoryText,
  type MemoryItem,
  type MemoryItemUpdateInput,
} from '@/lib/memory-items';
import {
  deleteMemoryItemEmbedding,
  upsertMemoryItemEmbeddings,
} from '@/lib/memory-items-server';
import { createSupabaseServerClient } from '@/lib/supabase-server';

const UpdateMemoryItemSchema = z
  .object({
    text: z.string().min(1).max(500).optional(),
    type: z.string().min(1).max(48).optional(),
    stability: z.enum(MEMORY_STABILITIES).optional(),
    sensitivity: z.enum(MEMORY_SENSITIVITIES).optional(),
    status: z.enum(MEMORY_STATUSES).optional(),
    salience: z.number().min(0).max(100).optional(),
    confidence: z.number().min(0).max(1).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
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

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createSupabaseServerClient();
    const user = await getAuthenticatedUser(supabase);

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const parsed = UpdateMemoryItemSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Invalid request body',
          details: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }

    const input = parsed.data as MemoryItemUpdateInput;
    const updatePayload: Record<string, unknown> = {};

    if (input.text !== undefined) {
      const text = input.text.trim();
      updatePayload.text = text;
      updatePayload.normalized_text = normalizeMemoryText(text);
    }

    if (input.type !== undefined) {
      updatePayload.type = input.type
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '') || 'general';
    }

    if (input.stability !== undefined) updatePayload.stability = input.stability;
    if (input.sensitivity !== undefined) updatePayload.sensitivity = input.sensitivity;
    if (input.status !== undefined) updatePayload.status = input.status;
    if (input.salience !== undefined) updatePayload.salience = clampSalience(input.salience);
    if (input.confidence !== undefined) {
      updatePayload.confidence = clampConfidence(input.confidence);
    }

    const { data: updatedRow, error: updateError } = await supabase
      .from('memory_items')
      .update(updatePayload)
      .eq('id', id)
      .eq('user_id', user.id)
      .select('*')
      .single();

    if (updateError || !updatedRow) {
      if (updateError?.code === 'PGRST116') {
        return NextResponse.json({ error: 'Memory item not found' }, { status: 404 });
      }

      console.error('Memory item PATCH error:', updateError);
      return NextResponse.json({ error: 'Failed to update memory item' }, { status: 500 });
    }

    const updated = updatedRow as MemoryItem;

    if (updated.status === 'active') {
      await upsertMemoryItemEmbeddings(supabase, user.id, [
        {
          memoryItemId: updated.id,
          text: updated.text,
        },
      ]);
    } else {
      await deleteMemoryItemEmbedding(supabase, user.id, updated.id);
    }

    return NextResponse.json({ item: updated });
  } catch (error) {
    console.error('Memory item PATCH route error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createSupabaseServerClient();
    const user = await getAuthenticatedUser(supabase);

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const { data: deletedRow, error: deleteError } = await supabase
      .from('memory_items')
      .update({ status: 'deleted' })
      .eq('id', id)
      .eq('user_id', user.id)
      .select('*')
      .single();

    if (deleteError || !deletedRow) {
      if (deleteError?.code === 'PGRST116') {
        return NextResponse.json({ error: 'Memory item not found' }, { status: 404 });
      }

      console.error('Memory item DELETE error:', deleteError);
      return NextResponse.json({ error: 'Failed to delete memory item' }, { status: 500 });
    }

    await deleteMemoryItemEmbedding(supabase, user.id, id);

    return NextResponse.json({ item: deletedRow });
  } catch (error) {
    console.error('Memory item DELETE route error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

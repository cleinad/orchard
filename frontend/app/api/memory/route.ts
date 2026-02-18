import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import {
  parseLongTermFile,
  parseDailyFile,
  serializeLongTermEntries,
  serializeDailyEntries,
} from '@/lib/memory-entries';
import type { MemoryFile, LongTermEntry, DailyEntry } from '@/lib/memory-types';

async function getAuthenticatedUser(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>) {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

async function getMemoryFile(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string,
  fileId: string
): Promise<MemoryFile | null> {
  const { data } = await supabase
    .from('memory_files')
    .select('*')
    .eq('id', fileId)
    .eq('user_id', userId)
    .single();
  return data;
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const user = await getAuthenticatedUser(supabase);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { fileId, entryIndex, updated } = await request.json();

    if (!fileId || entryIndex === undefined || !updated) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const file = await getMemoryFile(supabase, user.id, fileId);
    if (!file) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    let newContent: string;

    if (file.category === 'daily') {
      const entries = parseDailyFile(file);
      if (entryIndex < 0 || entryIndex >= entries.length) {
        return NextResponse.json({ error: 'Invalid entry index' }, { status: 400 });
      }
      entries[entryIndex] = updated as DailyEntry;
      newContent = serializeDailyEntries(entries);
    } else {
      const entries = parseLongTermFile(file);
      if (entryIndex < 0 || entryIndex >= entries.length) {
        return NextResponse.json({ error: 'Invalid entry index' }, { status: 400 });
      }
      entries[entryIndex] = updated as LongTermEntry;
      newContent = serializeLongTermEntries(entries);
    }

    const { error: updateError } = await supabase
      .from('memory_files')
      .update({ content: newContent })
      .eq('id', fileId)
      .eq('user_id', user.id);

    if (updateError) {
      return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Memory PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const user = await getAuthenticatedUser(supabase);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { fileId, entryIndex } = await request.json();

    if (!fileId || entryIndex === undefined) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const file = await getMemoryFile(supabase, user.id, fileId);
    if (!file) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    let newContent: string;

    if (file.category === 'daily') {
      const entries = parseDailyFile(file);
      if (entryIndex < 0 || entryIndex >= entries.length) {
        return NextResponse.json({ error: 'Invalid entry index' }, { status: 400 });
      }
      entries.splice(entryIndex, 1);
      newContent = serializeDailyEntries(entries);
    } else {
      const entries = parseLongTermFile(file);
      if (entryIndex < 0 || entryIndex >= entries.length) {
        return NextResponse.json({ error: 'Invalid entry index' }, { status: 400 });
      }
      entries.splice(entryIndex, 1);
      newContent = serializeLongTermEntries(entries);
    }

    // If no entries left, delete the row entirely
    if (!newContent.trim()) {
      const { error: deleteError } = await supabase
        .from('memory_files')
        .delete()
        .eq('id', fileId)
        .eq('user_id', user.id);

      if (deleteError) {
        return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
      }
    } else {
      const { error: updateError } = await supabase
        .from('memory_files')
        .update({ content: newContent })
        .eq('id', fileId)
        .eq('user_id', user.id);

      if (updateError) {
        return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Memory DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

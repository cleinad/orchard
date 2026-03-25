import type { SupabaseClient } from '@supabase/supabase-js';
import {
  type LoadMemoryContextV2Options,
  type MemoryActor,
} from './memory-items';
import { loadMemoryContextV2 as loadMemoryContextV2Internal } from './memory-items-server';

export async function loadMemoryContextV2(
  supabase: SupabaseClient,
  userId: string,
  options: LoadMemoryContextV2Options
): Promise<string> {
  return loadMemoryContextV2Internal(supabase, userId, options);
}

export async function loadMemoryContext(
  supabase: SupabaseClient,
  userId: string,
  actor: MemoryActor = 'default',
  mentorId?: string | null,
  query?: string
): Promise<string> {
  return loadMemoryContextV2Internal(supabase, userId, {
    actor,
    mentorId,
    query,
  });
}

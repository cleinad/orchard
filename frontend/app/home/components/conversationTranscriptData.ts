import type { SupabaseClient } from '@supabase/supabase-js';

export const MAIN_TRANSCRIPT_PAGE_SIZE = 500;

export interface PersistedMainTranscriptRow {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  search_metadata?: unknown;
  previous_message_id: string | null;
}

export interface CompleteMainTranscriptResult {
  rows: PersistedMainTranscriptRow[];
  isComplete: true;
}

function isPersistedMainTranscriptRow(
  row: unknown
): row is PersistedMainTranscriptRow {
  if (!row || typeof row !== 'object') return false;
  const candidate = row as Record<string, unknown>;
  return (
    typeof candidate.id === 'string'
    && (candidate.role === 'user' || candidate.role === 'assistant')
    && typeof candidate.content === 'string'
    && typeof candidate.created_at === 'string'
    && (
      candidate.previous_message_id === null
      || typeof candidate.previous_message_id === 'string'
      || candidate.previous_message_id === undefined
    )
  );
}

export async function fetchCompleteMainTranscript(
  supabase: Pick<SupabaseClient, 'from'>,
  conversationId: string
): Promise<CompleteMainTranscriptResult> {
  const rows: PersistedMainTranscriptRow[] = [];
  const seenIds = new Set<string>();
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('messages')
      .select(
        'id, role, content, created_at, search_metadata, previous_message_id'
      )
      .eq('conversation_id', conversationId)
      .is('thread_id', null)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + MAIN_TRANSCRIPT_PAGE_SIZE - 1);

    if (error) {
      throw new Error(error.message);
    }

    const rawRows = data ?? [];
    if (!rawRows.every(isPersistedMainTranscriptRow)) {
      throw new Error('Transcript contained an invalid message row.');
    }
    const pageRows = rawRows.map((row) => ({
        ...row,
        previous_message_id: row.previous_message_id ?? null,
      }));

    for (const row of pageRows) {
      if (seenIds.has(row.id)) continue;
      seenIds.add(row.id);
      rows.push(row);
    }

    if (rawRows.length < MAIN_TRANSCRIPT_PAGE_SIZE) {
      return { rows, isComplete: true };
    }
    from += MAIN_TRANSCRIPT_PAGE_SIZE;
  }
}

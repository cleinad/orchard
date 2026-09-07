import type { createSupabaseServerClient } from '@/lib/supabase-server';
import { MAX_CHAT_HISTORY_MESSAGES } from '@/lib/chat-session';

export const MAX_PERSISTENT_MAIN_PATH_MESSAGES = MAX_CHAT_HISTORY_MESSAGES;
export const PERSISTENT_MAIN_ANCHOR_WINDOW_MESSAGES = 500;

type SupabaseServerClient = Awaited<
  ReturnType<typeof createSupabaseServerClient>
>;

export interface PersistedMainMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  previous_message_id: string | null;
  created_at: string;
  search_metadata?: unknown;
}

function normalizePersistedMainMessage(
  row: unknown
): PersistedMainMessage | null {
  if (
    !row
    || typeof row !== 'object'
    || typeof (row as { id?: unknown }).id !== 'string'
    || (
      (row as { role?: unknown }).role !== 'user'
      && (row as { role?: unknown }).role !== 'assistant'
    )
    || typeof (row as { content?: unknown }).content !== 'string'
  ) {
    return null;
  }

  const message = row as {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    previous_message_id?: unknown;
    created_at?: unknown;
    search_metadata?: unknown;
  };

  return {
    id: message.id,
    role: message.role,
    content: message.content,
    previous_message_id:
      typeof message.previous_message_id === 'string'
        ? message.previous_message_id
        : null,
    created_at:
      typeof message.created_at === 'string' ? message.created_at : '',
    search_metadata: message.search_metadata,
  };
}

async function fetchPersistentMainMessageById(
  supabase: SupabaseServerClient,
  conversationId: string,
  messageId: string
): Promise<PersistedMainMessage | null> {
  const { data: row, error } = await supabase
    .from('messages')
    .select(
      'id, role, content, previous_message_id, created_at, search_metadata'
    )
    .eq('id', messageId)
    .eq('conversation_id', conversationId)
    .is('thread_id', null)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  return normalizePersistedMainMessage(row);
}

async function fetchPersistentMainAnchorWindow(
  supabase: SupabaseServerClient,
  conversationId: string,
  sourceMessage: PersistedMainMessage,
  historyMessageIds: string[]
) {
  const query = supabase
    .from('messages')
    .select(
      'id, role, content, previous_message_id, created_at, search_metadata'
    )
    .eq('conversation_id', conversationId)
    .is('thread_id', null);

  const { data: rows, error } = historyMessageIds.length > 0
    ? await query.in('id', historyMessageIds)
    : await (
        sourceMessage.created_at
          ? query.lte('created_at', sourceMessage.created_at)
          : query
      )
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(PERSISTENT_MAIN_ANCHOR_WINDOW_MESSAGES);

  if (error) {
    throw new Error(error.message);
  }
  return (rows || [])
    .map((row) => normalizePersistedMainMessage(row))
    .filter((row): row is PersistedMainMessage => row !== null);
}

export async function fetchPersistentMainPathToMessage(
  supabase: SupabaseServerClient,
  conversationId: string | null,
  messageId: string | null,
  historyMessageIds: string[] = []
): Promise<PersistedMainMessage[]> {
  if (!conversationId || !messageId) {
    return [];
  }

  const sourceMessage = await fetchPersistentMainMessageById(
    supabase,
    conversationId,
    messageId
  );
  if (!sourceMessage) {
    return [];
  }

  const anchorWindow = await fetchPersistentMainAnchorWindow(
    supabase,
    conversationId,
    sourceMessage,
    historyMessageIds
  );
  const messagesById = new Map(
    anchorWindow.map((message) => [message.id, message])
  );
  messagesById.set(sourceMessage.id, sourceMessage);

  const path: PersistedMainMessage[] = [];
  const seen = new Set<string>();
  let currentId: string | null = messageId;

  while (
    currentId
    && path.length < MAX_PERSISTENT_MAIN_PATH_MESSAGES
    && !seen.has(currentId)
  ) {
    seen.add(currentId);
    const row: PersistedMainMessage | null =
      messagesById.get(currentId) ?? null;
    if (!row) {
      throw new Error(
        `Unable to reconstruct predecessor ${currentId} within the bounded history window for conversation ${conversationId}.`
      );
    }

    path.push(row);
    currentId = row.previous_message_id;
  }

  if (currentId && seen.has(currentId)) {
    throw new Error(
      `Conversation ${conversationId} contains a predecessor cycle.`
    );
  }
  return path.reverse();
}

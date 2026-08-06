import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  BranchSelectionMap,
  ConversationBranch,
  Message,
} from '@/app/home/types';
import type { ThreadMeta } from '@/app/home/components/threadTypes';
import {
  type ChatImageAttachment,
  type ChatImageMimeType,
} from '@/lib/chat-attachments';
import { parsePersistedSearchMetadata } from '@/lib/search-citations';
import { buildInitialBranchSelections } from '@/app/home/components/conversationTree';
import { getSelectionStreamVersion } from '@/app/home/components/markdownSelectableStream';

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

export interface LoadedConversationTranscript {
  messages: Message[];
  branches: ConversationBranch[];
  selectedBranchIds: BranchSelectionMap;
  threadsMap: Map<string, ThreadMeta[]>;
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

function buildThreadsMap(
  threadRows: Array<{
    id: string;
    source_message_id: string;
    highlighted_text: string;
    start_offset: number;
    end_offset: number;
    selection_stream_version?: string | null;
  }>
) {
  const threadsMap = new Map<string, ThreadMeta[]>();

  for (const thread of threadRows) {
    const existing = threadsMap.get(thread.source_message_id) ?? [];
    existing.push({
      threadId: thread.id,
      highlightedText: thread.highlighted_text,
      sourceMessageId: thread.source_message_id,
      startOffset: thread.start_offset,
      endOffset: thread.end_offset,
      selectionStreamVersion: getSelectionStreamVersion(
        thread.selection_stream_version
      ),
    });
    threadsMap.set(thread.source_message_id, existing);
  }

  return threadsMap;
}

export async function loadCompleteConversationTranscript(
  supabase: Pick<SupabaseClient, 'from'>,
  conversationId: string
): Promise<LoadedConversationTranscript> {
  const transcriptRequest = fetchCompleteMainTranscript(
    supabase,
    conversationId
  );
  const branchesRequest = supabase
    .from('conversation_branches')
    .select('id, source_message_id, entry_message_id, title, is_main, position')
    .eq('conversation_id', conversationId)
    .order('position', { ascending: true });
  const threadsRequest = supabase
    .from('threads')
    .select(
      'id, source_message_id, highlighted_text, start_offset, end_offset, selection_stream_version'
    )
    .eq('conversation_id', conversationId);

  const [
    transcriptResult,
    { data: branchRows, error: branchesError },
    { data: threadRows, error: threadsError },
  ] = await Promise.all([transcriptRequest, branchesRequest, threadsRequest]);

  const messages: Message[] = transcriptResult.rows.map((message) => {
    const searchMetadata = parsePersistedSearchMetadata(message.search_metadata);

    return {
      id: message.id,
      role: message.role,
      content: message.content,
      timestamp: new Date(message.created_at),
      searchMetadata,
      searchActivity:
        searchMetadata?.version === 2 ? searchMetadata.activity ?? null : null,
      previousMessageId: message.previous_message_id,
    };
  });

  const messageIds = messages.map((message) => message.id);
  if (messageIds.length > 0) {
    const attachmentResponses = await Promise.all(
      Array.from(
        { length: Math.ceil(messageIds.length / 100) },
        (_, index) => messageIds.slice(index * 100, (index + 1) * 100)
      ).map((messageIdChunk) =>
        supabase
          .from('message_attachments')
          .select(
            'id, message_id, storage_path, file_name, mime_type, size_bytes, width, height'
          )
          .in('message_id', messageIdChunk)
          .order('position', { ascending: true })
      )
    );
    const attachmentsError = attachmentResponses.find(
      (response) => response.error
    )?.error;
    const attachmentRows = attachmentResponses.flatMap(
      (response) => response.data ?? []
    );

    if (!attachmentsError && attachmentRows.length > 0) {
      const attachmentsByMessageId = new Map<string, ChatImageAttachment[]>();
      for (const row of attachmentRows as Array<{
        id: string;
        message_id: string;
        storage_path: string;
        file_name: string;
        mime_type: ChatImageMimeType;
        size_bytes: number;
        width: number | null;
        height: number | null;
      }>) {
        const existing = attachmentsByMessageId.get(row.message_id) ?? [];
        existing.push({
          id: row.id,
          messageId: row.message_id,
          storagePath: row.storage_path,
          fileName: row.file_name,
          mimeType: row.mime_type,
          sizeBytes: row.size_bytes,
          width: row.width,
          height: row.height,
          url: `/api/chat/images/${row.id}`,
        });
        attachmentsByMessageId.set(row.message_id, existing);
      }

      for (const message of messages) {
        message.attachments = attachmentsByMessageId.get(message.id) ?? [];
      }
    } else if (attachmentsError) {
      console.error('Failed to load message attachments:', attachmentsError);
    }
  }

  const branches: ConversationBranch[] = branchesError
    ? []
    : ((branchRows ?? []) as Array<{
        id: string;
        source_message_id: string;
        entry_message_id: string;
        title: string;
        is_main: boolean;
        position: number;
      }>).map((branch) => ({
        id: branch.id,
        sourceMessageId: branch.source_message_id,
        entryMessageId: branch.entry_message_id,
        title: branch.title,
        isMain: branch.is_main,
        position: branch.position,
      }));

  if (threadsError) {
    console.error('Failed to load threads:', threadsError);
  }

  return {
    messages,
    branches,
    selectedBranchIds: buildInitialBranchSelections(branches),
    threadsMap: threadsError
      ? new Map<string, ThreadMeta[]>()
      : buildThreadsMap(
          (threadRows ?? []) as Array<{
            id: string;
            source_message_id: string;
            highlighted_text: string;
            start_offset: number;
            end_offset: number;
            selection_stream_version?: string | null;
          }>
        ),
    isComplete: transcriptResult.isComplete,
  };
}

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
import type {
  HomeDataUnavailableReason,
  HomeResourceStatus,
} from '@/app/home/components/homeSidebarData';

export const MAIN_TRANSCRIPT_PAGE_SIZE = 500;
const DEFAULT_OPTIONAL_METADATA_TIMEOUT_MS = 2_000;

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
  metadataStatus: ConversationMetadataStatus;
  isComplete: true;
}

export interface ConversationMetadataStatus {
  branches: HomeResourceStatus;
  threads: HomeResourceStatus;
  attachments: HomeResourceStatus;
}

export class TranscriptLoadError extends Error {
  readonly reason: HomeDataUnavailableReason;

  constructor(reason: HomeDataUnavailableReason) {
    super(
      reason === 'timeout'
        ? 'The conversation took too long to load.'
        : 'The conversation could not be loaded.'
    );
    this.name = 'TranscriptLoadError';
    this.reason = reason;
  }
}

interface TranscriptLoadOptions {
  signal?: AbortSignal;
  optionalMetadataTimeoutMs?: number;
}

function createResourceDeadline(
  parentSignal: AbortSignal | undefined,
  timeoutMs: number
) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const abortFromParent = () => controller.abort();
  if (parentSignal?.aborted) {
    controller.abort();
  } else {
    parentSignal?.addEventListener('abort', abortFromParent, { once: true });
  }
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  return {
    signal: controller.signal,
    durationMs: () => Date.now() - startedAt,
    cleanup() {
      clearTimeout(timeout);
      parentSignal?.removeEventListener('abort', abortFromParent);
    },
  };
}

function unavailableStatus(
  signal: AbortSignal,
  error: unknown
): HomeResourceStatus {
  if (!error) return { status: 'ready' };
  return {
    status: 'unavailable',
    reason: signal.aborted ? 'timeout' : 'error',
  };
}

function recordMetadataFailure(
  resource: keyof ConversationMetadataStatus,
  status: HomeResourceStatus,
  durationMs: number
) {
  if (status.status === 'ready') return;
  console.warn('[home-data]', {
    routeClass: 'transcript',
    resource,
    status: 'unavailable',
    reason: status.reason,
    durationMs,
  });
}

async function settleOptionalRequest<T>(
  request: PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<{ data: T[] | null; error: unknown }> {
  try {
    return await request;
  } catch {
    return { data: null, error: true };
  }
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
  conversationId: string,
  options: Pick<TranscriptLoadOptions, 'signal'> = {}
): Promise<CompleteMainTranscriptResult> {
  const rows: PersistedMainTranscriptRow[] = [];
  const seenIds = new Set<string>();
  let from = 0;

  while (true) {
    let query = supabase
      .from('messages')
      .select(
        'id, role, content, created_at, search_metadata, previous_message_id'
      )
      .eq('conversation_id', conversationId)
      .is('thread_id', null)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + MAIN_TRANSCRIPT_PAGE_SIZE - 1);
    if (options.signal) {
      query = query.abortSignal(options.signal);
    }
    let data;
    let error;
    try {
      ({ data, error } = await query);
    } catch {
      throw new TranscriptLoadError(
        options.signal?.aborted ? 'timeout' : 'error'
      );
    }

    if (error) {
      throw new TranscriptLoadError(
        options.signal?.aborted ? 'timeout' : 'error'
      );
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
  conversationId: string,
  options: TranscriptLoadOptions = {}
): Promise<LoadedConversationTranscript> {
  const optionalMetadataTimeoutMs =
    options.optionalMetadataTimeoutMs ?? DEFAULT_OPTIONAL_METADATA_TIMEOUT_MS;
  const branchDeadline = createResourceDeadline(
    options.signal,
    optionalMetadataTimeoutMs
  );
  const threadDeadline = createResourceDeadline(
    options.signal,
    optionalMetadataTimeoutMs
  );
  const transcriptRequest = fetchCompleteMainTranscript(
    supabase,
    conversationId,
    { signal: options.signal }
  );
  const branchesRequest = settleOptionalRequest(
    supabase
      .from('conversation_branches')
      .select('id, source_message_id, entry_message_id, title, is_main, position')
      .eq('conversation_id', conversationId)
      .order('position', { ascending: true })
      .abortSignal(branchDeadline.signal)
  );
  const threadsRequest = settleOptionalRequest(
    supabase
      .from('threads')
      .select(
        'id, source_message_id, highlighted_text, start_offset, end_offset, selection_stream_version'
      )
      .eq('conversation_id', conversationId)
      .abortSignal(threadDeadline.signal)
  );

  let transcriptResult: CompleteMainTranscriptResult;
  let branchRows: unknown[] | null;
  let branchesError: unknown;
  let threadRows: unknown[] | null;
  let threadsError: unknown;
  try {
    [
      transcriptResult,
      { data: branchRows, error: branchesError },
      { data: threadRows, error: threadsError },
    ] = await Promise.all([transcriptRequest, branchesRequest, threadsRequest]);
  } finally {
    branchDeadline.cleanup();
    threadDeadline.cleanup();
  }
  const branchStatus = unavailableStatus(
    branchDeadline.signal,
    branchesError
  );
  const threadStatus = unavailableStatus(
    threadDeadline.signal,
    threadsError
  );
  recordMetadataFailure(
    'branches',
    branchStatus,
    branchDeadline.durationMs()
  );
  recordMetadataFailure('threads', threadStatus, threadDeadline.durationMs());

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
  let attachmentStatus: HomeResourceStatus = { status: 'ready' };
  if (messageIds.length > 0) {
    const attachmentDeadline = createResourceDeadline(
      options.signal,
      optionalMetadataTimeoutMs
    );
    let attachmentResponses;
    try {
      attachmentResponses = await Promise.all(
        Array.from(
          { length: Math.ceil(messageIds.length / 100) },
          (_, index) => messageIds.slice(index * 100, (index + 1) * 100)
        ).map((messageIdChunk) =>
          settleOptionalRequest(
            supabase
              .from('message_attachments')
              .select(
                'id, message_id, storage_path, file_name, mime_type, size_bytes, width, height'
              )
              .in('message_id', messageIdChunk)
              .order('position', { ascending: true })
              .abortSignal(attachmentDeadline.signal)
          )
        )
      );
    } finally {
      attachmentDeadline.cleanup();
    }
    const attachmentsError = attachmentResponses.find(
      (response) => response.error
    )?.error;
    attachmentStatus = unavailableStatus(
      attachmentDeadline.signal,
      attachmentsError
    );
    recordMetadataFailure(
      'attachments',
      attachmentStatus,
      attachmentDeadline.durationMs()
    );
    const attachmentRows = attachmentResponses.flatMap(
      (response) => response.data ?? []
    );

    if (attachmentRows.length > 0) {
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
    }
  }

  const branches: ConversationBranch[] = branchStatus.status === 'unavailable'
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

  return {
    messages,
    branches,
    selectedBranchIds: buildInitialBranchSelections(branches),
    threadsMap: threadStatus.status === 'unavailable'
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
    metadataStatus: {
      branches: branchStatus,
      threads: threadStatus,
      attachments: attachmentStatus,
    },
    isComplete: transcriptResult.isComplete,
  };
}

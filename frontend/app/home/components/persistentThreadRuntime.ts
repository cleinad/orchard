import type {
  InlineThreadMarker,
  ThreadMessage,
  ThreadMeta,
  ThreadSession,
  ThreadSessionStatus,
  ThreadSource,
} from '@/app/home/components/threadTypes';
import {
  fromStoredThreadMessage,
  toStoredThreadMessage,
  type StoredThreadMessage,
} from '@/app/home/components/homeStorage';
import type { Message } from '@/app/home/types';
import {
  getSelectionStreamVersion,
} from '@/app/home/components/markdownSelectableStream';

export type ThreadMetaRecord = Record<string, ThreadMeta[]>;
export type ThreadMessagesRecord = Record<string, ThreadMessage[]>;
export type ThreadStatusRecord = Record<string, ThreadSessionStatus>;

export interface PersistentThreadRuntime {
  threadsMap: ThreadMetaRecord;
  threadMessages: ThreadMessagesRecord;
  threadStatuses: ThreadStatusRecord;
}

interface StoredPersistentThreadRuntime {
  threadsMap: ThreadMetaRecord;
  threadMessages: Record<string, StoredThreadMessage[]>;
  threadStatuses: ThreadStatusRecord;
}

export type PersistentThreadRuntimeRecord = Record<string, PersistentThreadRuntime>;
type StoredPersistentThreadRuntimeRecord = Record<string, StoredPersistentThreadRuntime>;

export function createEmptyPersistentThreadRuntime(): PersistentThreadRuntime {
  return {
    threadsMap: {},
    threadMessages: {},
    threadStatuses: {},
  };
}

export function serializePersistentThreadRuntimes(runtimes: PersistentThreadRuntimeRecord) {
  const serialized: StoredPersistentThreadRuntimeRecord = Object.fromEntries(
    Object.entries(runtimes).map(([conversationId, runtime]) => [
      conversationId,
      {
        threadsMap: runtime.threadsMap,
        threadStatuses: runtime.threadStatuses,
        threadMessages: Object.fromEntries(
          Object.entries(runtime.threadMessages).map(([threadId, messages]) => [
            threadId,
            messages.map(toStoredThreadMessage),
          ])
        ),
      },
    ])
  );

  return JSON.stringify(serialized);
}

export function deserializePersistentThreadRuntimes(raw: string): PersistentThreadRuntimeRecord {
  const parsed = JSON.parse(raw) as StoredPersistentThreadRuntimeRecord;

  return Object.fromEntries(
    Object.entries(parsed).map(([conversationId, runtime]) => [
      conversationId,
      {
        threadsMap: runtime.threadsMap || {},
        threadStatuses: runtime.threadStatuses || {},
        threadMessages: Object.fromEntries(
          Object.entries(runtime.threadMessages || {}).map(([threadId, messages]) => [
            threadId,
            messages.map(fromStoredThreadMessage),
          ])
        ),
      },
    ])
  );
}

export function recordToThreadsMap(record: ThreadMetaRecord | undefined) {
  return new Map<string, ThreadMeta[]>(Object.entries(record || {}));
}

export function mergeThreadsMaps(...maps: Array<Map<string, ThreadMeta[]> | null | undefined>) {
  let next = new Map<string, ThreadMeta[]>();

  for (const current of maps) {
    if (!current) {
      continue;
    }

    for (const threads of current.values()) {
      for (const thread of threads) {
        next = addThreadMetaToMap(next, thread.threadId, thread);
      }
    }
  }

  return next;
}

export function addThreadMetaToMap(
  prev: Map<string, ThreadMeta[]>,
  threadId: string,
  source: ThreadSource
) {
  const next = new Map(prev);
  const existing = next.get(source.sourceMessageId) || [];

  if (existing.some((thread) => thread.threadId === threadId)) {
    return next;
  }

  next.set(source.sourceMessageId, [
    ...existing,
    { threadId, ...source },
  ]);

  return next;
}

export function addThreadMetaToRecord(
  prev: ThreadMetaRecord,
  threadId: string,
  source: ThreadSource
) {
  const existing = prev[source.sourceMessageId] || [];

  if (existing.some((thread) => thread.threadId === threadId)) {
    return prev;
  }

  return {
    ...prev,
    [source.sourceMessageId]: [
      ...existing,
      { threadId, ...source },
    ],
  };
}

export function mapThreadMessages(rows: Array<{
  id: string;
  role: string;
  content: string;
  created_at: string;
  search_metadata?: Message['searchMetadata'];
}>): ThreadMessage[] {
  return rows.map((message) => ({
    id: message.id,
    role: message.role as 'user' | 'assistant',
    content: message.content,
    timestamp: new Date(message.created_at),
    searchMetadata: message.search_metadata ?? null,
  }));
}

export function mergeThreadMessages(
  serverMessages: ThreadMessage[],
  localMessages: ThreadMessage[]
): ThreadMessage[] {
  const merged = [...serverMessages];
  const isOptimisticId = (id: string) => /^\d+$/.test(id);

  for (const localMessage of localMessages) {
    const alreadyExists = merged.some(
      (serverMessage) =>
        serverMessage.id === localMessage.id ||
        (isOptimisticId(localMessage.id)
          && serverMessage.role === localMessage.role
          && serverMessage.content === localMessage.content
          && Math.abs(serverMessage.timestamp.getTime() - localMessage.timestamp.getTime()) < 5_000)
    );

    if (!alreadyExists) {
      merged.push(localMessage);
    }
  }

  return merged.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}

export function toInlineThreadMarker(
  thread: ThreadMeta,
  status: ThreadSessionStatus = 'ready'
): InlineThreadMarker {
  return {
    markerId: thread.threadId,
    threadId: thread.threadId,
    sessionId: null,
    status,
    highlightedText: thread.highlightedText,
    sourceMessageId: thread.sourceMessageId,
    startOffset: thread.startOffset,
    endOffset: thread.endOffset,
    selectionStreamVersion: getSelectionStreamVersion(thread.selectionStreamVersion),
  };
}

export function toSessionThreadMarker(session: ThreadSession): InlineThreadMarker {
  return {
    markerId: session.threadId ?? session.sessionId,
    threadId: session.threadId,
    sessionId: session.sessionId,
    status: session.status,
    highlightedText: session.highlightedText,
    sourceMessageId: session.sourceMessageId,
    startOffset: session.startOffset,
    endOffset: session.endOffset,
    selectionStreamVersion: getSelectionStreamVersion(session.selectionStreamVersion),
  };
}

export function buildInlineThreadMarkersMap(params: {
  persistedThreadsMap: Map<string, ThreadMeta[]>;
  threadStatuses?: ThreadStatusRecord;
  threadSessionsById: Record<string, ThreadSession>;
}) {
  const markersByMessageId = new Map<string, Map<string, InlineThreadMarker>>();

  const upsertMarker = (messageId: string, marker: InlineThreadMarker) => {
    const existingForMessage = markersByMessageId.get(messageId) || new Map<string, InlineThreadMarker>();
    const dedupeKey = marker.threadId
      ? `thread:${marker.threadId}`
      : `session:${marker.sessionId ?? marker.markerId}`;
    existingForMessage.set(dedupeKey, marker);
    markersByMessageId.set(messageId, existingForMessage);
  };

  for (const [messageId, threads] of params.persistedThreadsMap.entries()) {
    for (const thread of threads) {
      const status = params.threadStatuses?.[thread.threadId] ?? 'ready';
      upsertMarker(messageId, toInlineThreadMarker(thread, status));
    }
  }

  for (const session of Object.values(params.threadSessionsById)) {
    upsertMarker(session.sourceMessageId, toSessionThreadMarker(session));
  }

  return new Map<string, InlineThreadMarker[]>(
    Array.from(markersByMessageId.entries()).map(([messageId, markers]) => [
      messageId,
      Array.from(markers.values()).sort(
        (a, b) =>
          a.startOffset - b.startOffset
          || (b.endOffset - b.startOffset) - (a.endOffset - a.startOffset)
      ),
    ])
  );
}

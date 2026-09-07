import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabase: {},
}));

import {
  BLANK_COMPOSER_KEY,
  deleteRecordKey,
  getComposerStateKey,
  getSelectedChatKey,
  isSameSelectedChat,
} from '@/app/home/components/homeSelection';
import {
  fromStoredMessage,
  fromStoredThreadMessage,
  toStoredMessage,
  toStoredThreadMessage,
} from '@/app/home/components/homeStorage';
import {
  deserializePersistentThreadRuntimes,
  mergeThreadMessages,
} from '@/app/home/components/persistentThreadRuntime';
import { getTemporaryChatAttachmentStoragePaths } from '@/app/home/components/temporaryChatAttachmentCleanup';
import type { ThreadMessage } from '@/app/home/components/threadTypes';
import type { Message } from '@/app/home/types';
import {
  getDraftSelectionForPromotion,
  isDefinitivePreAcceptanceFailure,
  loadProvisionalChatPromotion,
  removeProvisionalChatPromotion,
  storeProvisionalChatPromotion,
} from '@/app/home/components/provisionalChatPromotion';
import {
  commitSynchronizedStateAction,
  deserializeTemporaryChats,
  serializeTemporaryChats,
  writeTemporaryChatsToStorage,
} from '@/app/home/components/HomeDataContext';
import { createQueuedChatRunSnapshot } from '@/lib/chat-runs/protocol';

function createSessionStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

describe('homeSelection helpers', () => {
  it('creates stable keys for blank, draft, temporary, and persistent chats', () => {
    expect(getSelectedChatKey(null)).toBeNull();
    expect(getComposerStateKey(null)).toBe(BLANK_COMPOSER_KEY);
    expect(getSelectedChatKey({
      kind: 'draft',
      draftId: 'draft-1',
      mentorId: null,
      workspaceId: null,
    }))
      .toBe('draft:draft-1');
    expect(getSelectedChatKey({ kind: 'temporary', tempChatId: 'temp-1' }))
      .toBe('temporary:temp-1');
    expect(getSelectedChatKey({
      kind: 'persistent',
      conversationId: 'conversation-1',
      mentorId: 'mentor-1',
      workspaceId: null,
    })).toBe('persistent:conversation-1');
  });

  it('compares selections by storage key and preserves records when deleting missing keys', () => {
    const first = {
      kind: 'draft' as const,
      draftId: 'draft-1',
      mentorId: null,
      workspaceId: null,
    };
    const same = {
      kind: 'draft' as const,
      draftId: 'draft-1',
      mentorId: 'mentor-1',
      workspaceId: null,
    };
    const different = {
      kind: 'draft' as const,
      draftId: 'draft-2',
      mentorId: null,
      workspaceId: null,
    };
    const record = { keep: 'value' };

    expect(isSameSelectedChat(first, same)).toBe(true);
    expect(isSameSelectedChat(first, different)).toBe(false);
    expect(isSameSelectedChat(null, null)).toBe(false);
    expect(deleteRecordKey(record, 'missing')).toBe(record);
    expect(deleteRecordKey(record, 'keep')).toEqual({});
  });
});

describe('homeStorage helpers', () => {
  it('round-trips message dates and nullable search metadata', () => {
    const message: Message = {
      id: 'message-1',
      role: 'assistant',
      content: 'Hello',
      isError: true,
      timestamp: new Date('2026-04-15T12:34:56.000Z'),
      searchMetadata: null,
      previousMessageId: null,
    };

    const restored = fromStoredMessage(toStoredMessage(message));

    expect(restored).toEqual({ ...message, attachments: [] });
    expect(restored.timestamp).toBeInstanceOf(Date);
  });

  it('round-trips thread message dates', () => {
    const message: ThreadMessage = {
      id: 'thread-message-1',
      role: 'user',
      content: 'Explain this',
      timestamp: new Date('2026-04-15T12:35:56.000Z'),
      searchMetadata: null,
    };

    const restored = fromStoredThreadMessage(toStoredThreadMessage(message));

    expect(restored).toEqual(message);
    expect(restored.timestamp).toBeInstanceOf(Date);
  });
});

describe('temporary chat storage', () => {
  it('makes consecutive state mutations visible before React renders again', () => {
    const stateRef = { current: ['existing'] };
    const commits: string[][] = [];

    commitSynchronizedStateAction(
      (current) => ['first', ...current],
      stateRef,
      (next) => commits.push(next)
    );
    commitSynchronizedStateAction(
      (current) => ['second', ...current],
      stateRef,
      (next) => commits.push(next)
    );

    expect(stateRef.current).toEqual(['second', 'first', 'existing']);
    expect(commits).toEqual([
      ['first', 'existing'],
      ['second', 'first', 'existing'],
    ]);
  });

  it('loads legacy memoryMode data and rewrites the session without it', () => {
    const restored = deserializeTemporaryChats(JSON.stringify([
      {
        id: 'temp-legacy',
        title: 'Legacy temporary chat',
        memoryMode: 'use_existing',
        createdAt: '2026-07-27T10:00:00.000Z',
        updatedAt: '2026-07-27T10:01:00.000Z',
        messages: [{
          id: 'message-legacy',
          role: 'user',
          content: 'Keep this conversation',
          timestamp: '2026-07-27T10:00:30.000Z',
          previousMessageId: null,
        }],
        branches: [],
        selectedBranchIds: {},
        threadsMap: {},
        threadMessages: {},
        threadStatuses: {},
      },
    ]));

    expect(restored).toHaveLength(1);
    expect(restored[0]).toMatchObject({
      id: 'temp-legacy',
      title: 'Legacy temporary chat',
      messages: [{
        id: 'message-legacy',
        content: 'Keep this conversation',
      }],
    });
    expect(restored[0]).not.toHaveProperty('memoryMode');

    const reserialized = JSON.parse(serializeTemporaryChats(restored)) as object[];
    expect(reserialized[0]).not.toHaveProperty('memoryMode');
    expect(reserialized[0]).toMatchObject({
      id: 'temp-legacy',
      title: 'Legacy temporary chat',
    });
  });

  it('keeps the active chat usable when session storage rejects a write', () => {
    const chats = deserializeTemporaryChats(JSON.stringify([
      {
        id: 'temp-storage-error',
        title: 'Temporary chat',
        createdAt: '2026-07-27T10:00:00.000Z',
        updatedAt: '2026-07-27T10:01:00.000Z',
        messages: [],
        branches: [],
        selectedBranchIds: {},
        threadsMap: {},
        threadMessages: {},
        threadStatuses: {},
      },
    ]));
    const blockedStorage = {
      setItem: () => {
        throw new Error('Storage blocked');
      },
      removeItem: () => {
        throw new Error('Storage blocked');
      },
    };

    expect(writeTemporaryChatsToStorage(blockedStorage, chats)).toBe(false);
    expect(writeTemporaryChatsToStorage(blockedStorage, [])).toBe(false);
  });
});

describe('provisional chat promotion helpers', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { sessionStorage: createSessionStorage() });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('round-trips the recovery draft and removes it after confirmation', () => {
    const promotion = {
      runId: '10000000-0000-4000-8000-000000000010',
      conversationId: '20000000-0000-4000-8000-000000000010',
      prompt: 'Keep this prompt editable',
      draft: {
        id: 'draft-recovery',
        mentorId: null,
        workspaceId: null,
        title: 'New chat' as const,
        createdAt: '2026-07-25T12:00:00.000Z',
        updatedAt: '2026-07-25T12:00:00.000Z',
        messages: [{
          id: 'message-before-send',
          role: 'assistant' as const,
          content: 'Earlier draft context',
          timestamp: new Date('2026-07-25T12:00:00.000Z'),
          previousMessageId: null,
        }],
        branches: [],
        selectedBranchIds: {},
      },
    };

    storeProvisionalChatPromotion(promotion);
    expect(loadProvisionalChatPromotion(promotion.runId)).toEqual({
      ...promotion,
      draft: {
        ...promotion.draft,
        messages: [{
          ...promotion.draft.messages[0],
          attachments: [],
          isError: undefined,
          searchMetadata: null,
        }],
      },
    });
    expect(getDraftSelectionForPromotion(promotion)).toEqual({
      kind: 'draft',
      draftId: promotion.draft.id,
      mentorId: null,
      workspaceId: null,
    });

    removeProvisionalChatPromotion(promotion.runId);
    expect(loadProvisionalChatPromotion(promotion.runId)).toBeNull();
  });

  it('distinguishes confirmed rejection from accepted and ambiguous failures', () => {
    const queued = createQueuedChatRunSnapshot({
      identifiers: {
        runId: '30000000-0000-4000-8000-000000000010',
        userMessageId: '40000000-0000-4000-8000-000000000010',
        assistantMessageId: '50000000-0000-4000-8000-000000000010',
      },
      mode: 'persistent',
      target: {
        kind: 'main',
        chatId: '20000000-0000-4000-8000-000000000010',
        conversationId: '20000000-0000-4000-8000-000000000010',
        threadId: null,
        branchId: null,
        branchSourceMessageId: null,
        sourceMessageId: null,
        expectedPredecessorId: null,
      },
      fallbackTitle: 'Fallback',
    });
    const rejected = {
      ...queued,
      status: 'failed' as const,
      errorCode: 'submission_rejected',
    };

    expect(isDefinitivePreAcceptanceFailure(rejected)).toBe(true);
    expect(isDefinitivePreAcceptanceFailure({
      ...rejected,
      acceptedAt: '2026-07-25T12:00:01.000Z',
    })).toBe(false);
    expect(isDefinitivePreAcceptanceFailure({
      ...queued,
      status: 'interrupted',
      errorCode: 'connection_interrupted',
    })).toBe(false);
  });

  it('retains active-tab recovery when session storage is unavailable', () => {
    vi.stubGlobal('window', {
      sessionStorage: {
        getItem: () => null,
        setItem: () => {
          throw new Error('Storage blocked');
        },
        removeItem: () => {
          throw new Error('Storage blocked');
        },
      },
    });
    const promotion = {
      runId: '60000000-0000-4000-8000-000000000010',
      conversationId: '70000000-0000-4000-8000-000000000010',
      prompt: 'Recover without browser storage',
      draft: {
        id: 'draft-memory-recovery',
        mentorId: null,
        workspaceId: null,
        title: 'New chat' as const,
        createdAt: '2026-07-25T12:00:00.000Z',
        updatedAt: '2026-07-25T12:00:00.000Z',
        messages: [],
        branches: [],
        selectedBranchIds: {},
      },
    };

    expect(() => storeProvisionalChatPromotion(promotion)).not.toThrow();
    expect(loadProvisionalChatPromotion(promotion.runId)).toEqual(promotion);
    expect(() => removeProvisionalChatPromotion(promotion.runId)).not.toThrow();
  });
});

describe('persistentThreadRuntime helpers', () => {
  it('deserializes missing runtime sections with empty fallbacks', () => {
    const runtime = deserializePersistentThreadRuntimes(JSON.stringify({
      conversationA: {
        threadsMap: {
          messageA: [{
            threadId: 'threadA',
            highlightedText: 'quote',
            sourceMessageId: 'messageA',
            startOffset: 0,
            endOffset: 5,
          }],
        },
      },
    }));

    expect(runtime.conversationA.threadsMap.messageA).toHaveLength(1);
    expect(runtime.conversationA.threadMessages).toEqual({});
    expect(runtime.conversationA.threadStatuses).toEqual({});
  });

  it('dedupes optimistic local thread messages against nearby server messages', () => {
    const serverMessages: ThreadMessage[] = [
      {
        id: 'server-user',
        role: 'user',
        content: 'What does this mean?',
        timestamp: new Date('2026-04-15T12:00:03.000Z'),
      },
      {
        id: 'server-assistant',
        role: 'assistant',
        content: 'It means this.',
        timestamp: new Date('2026-04-15T12:00:05.000Z'),
      },
    ];
    const localMessages: ThreadMessage[] = [
      {
        id: '123456',
        role: 'user',
        content: 'What does this mean?',
        timestamp: new Date('2026-04-15T12:00:00.000Z'),
      },
      {
        id: 'local-followup',
        role: 'assistant',
        content: 'Local-only response',
        timestamp: new Date('2026-04-15T12:00:06.000Z'),
      },
    ];

    expect(mergeThreadMessages(serverMessages, localMessages).map((message) => message.id))
      .toEqual(['server-user', 'server-assistant', 'local-followup']);
  });
});

describe('temporary chat attachment cleanup helpers', () => {
  it('collects unique storage paths for the closed temporary chat only', () => {
    expect(getTemporaryChatAttachmentStoragePaths([
      {
        id: 'temp-1',
        title: 'Temporary chat',
        createdAt: '2026-06-15T00:00:00.000Z',
        updatedAt: '2026-06-15T00:00:00.000Z',
        messages: [
          {
            id: 'message-1',
            role: 'user',
            content: 'first image',
            timestamp: new Date('2026-06-15T00:00:00.000Z'),
            previousMessageId: null,
            attachments: [
              {
                id: 'attachment-1',
                storagePath: 'user-1/image-a.png',
                fileName: 'image-a.png',
                mimeType: 'image/png',
                sizeBytes: 12,
                width: 10,
                height: 10,
              },
              {
                id: 'attachment-2',
                storagePath: 'user-1/image-a.png',
                fileName: 'image-a-copy.png',
                mimeType: 'image/png',
                sizeBytes: 12,
                width: 10,
                height: 10,
              },
              {
                id: 'attachment-local-preview',
                storagePath: '',
                fileName: 'preview.png',
                mimeType: 'image/png',
                sizeBytes: 12,
                width: 10,
                height: 10,
              },
            ],
          },
          {
            id: 'message-2',
            role: 'assistant',
            content: 'response',
            timestamp: new Date('2026-06-15T00:00:01.000Z'),
            previousMessageId: 'message-1',
          },
          {
            id: 'message-3',
            role: 'user',
            content: 'second image',
            timestamp: new Date('2026-06-15T00:00:02.000Z'),
            previousMessageId: 'message-2',
            attachments: [
              {
                id: 'attachment-3',
                storagePath: 'user-1/image-b.webp',
                fileName: 'image-b.webp',
                mimeType: 'image/webp',
                sizeBytes: 12,
                width: 10,
                height: 10,
              },
            ],
          },
        ],
        branches: [],
        selectedBranchIds: {},
        threadsMap: {},
        threadMessages: {},
        threadStatuses: {},
      },
      {
        id: 'temp-2',
        title: 'Other temporary chat',
        createdAt: '2026-06-15T00:00:00.000Z',
        updatedAt: '2026-06-15T00:00:00.000Z',
        messages: [
          {
            id: 'message-other',
            role: 'user',
            content: 'do not delete',
            timestamp: new Date('2026-06-15T00:00:00.000Z'),
            previousMessageId: null,
            attachments: [
              {
                id: 'attachment-other',
                storagePath: 'user-1/keep.png',
                fileName: 'keep.png',
                mimeType: 'image/png',
                sizeBytes: 12,
                width: 10,
                height: 10,
              },
            ],
          },
        ],
        branches: [],
        selectedBranchIds: {},
        threadsMap: {},
        threadMessages: {},
        threadStatuses: {},
      },
    ], 'temp-1')).toEqual([
      'user-1/image-a.png',
      'user-1/image-b.webp',
    ]);
  });
});

import { describe, expect, it } from 'vitest';
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
        memoryMode: 'off',
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
        memoryMode: 'off',
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

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
import type { ThreadMessage } from '@/app/home/components/threadTypes';
import type { Message } from '@/app/home/types';

describe('homeSelection helpers', () => {
  it('creates stable keys for blank, draft, temporary, and persistent chats', () => {
    expect(getSelectedChatKey(null)).toBeNull();
    expect(getComposerStateKey(null)).toBe(BLANK_COMPOSER_KEY);
    expect(getSelectedChatKey({ kind: 'draft', draftId: 'draft-1', mentorId: null }))
      .toBe('draft:draft-1');
    expect(getSelectedChatKey({ kind: 'temporary', tempChatId: 'temp-1' }))
      .toBe('temporary:temp-1');
    expect(getSelectedChatKey({
      kind: 'persistent',
      conversationId: 'conversation-1',
      mentorId: 'mentor-1',
    })).toBe('persistent:conversation-1');
  });

  it('compares selections by storage key and preserves records when deleting missing keys', () => {
    const first = { kind: 'draft' as const, draftId: 'draft-1', mentorId: null };
    const same = { kind: 'draft' as const, draftId: 'draft-1', mentorId: 'mentor-1' };
    const different = { kind: 'draft' as const, draftId: 'draft-2', mentorId: null };
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

    expect(restored).toEqual(message);
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

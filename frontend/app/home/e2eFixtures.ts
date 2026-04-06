import type { Message } from '@/app/home/types';
import type { ThreadMeta } from '@/app/home/components/threadTypes';
import type { ChatMode } from '@/lib/chat-session';

export interface HomeE2eFixture {
  key: string;
  chatMode: ChatMode;
  conversationId: string | null;
  messages: Message[];
  threads?: ThreadMeta[];
}

const INLINE_THREADS_MESSAGE_CONTENT = [
  'The event loop coordinates work between tasks, microtasks, and rendering.',
  'A useful rule of thumb is that microtasks run before the browser paints the next frame,',
  'which is why promise callbacks can update state before rendering catches up.',
].join(' ');
const INLINE_THREADS_ORDERED_LIST_TEXT = 'microtasks run before the browser paints the next frame';
const INLINE_THREADS_ORDERED_LIST_CONTENT = `3. ${INLINE_THREADS_ORDERED_LIST_TEXT}`;
const INLINE_THREADS_REPEATED_TEXT = 'before paint';
const INLINE_THREADS_REPEATED_CONTENT =
  'One update can happen before paint, and another can also happen before paint when microtasks keep draining.';
const INLINE_THREADS_REPEATED_SECOND_OFFSET = INLINE_THREADS_REPEATED_CONTENT.indexOf(
  INLINE_THREADS_REPEATED_TEXT,
  INLINE_THREADS_REPEATED_CONTENT.indexOf(INLINE_THREADS_REPEATED_TEXT) + 1
);
const INLINE_THREADS_BULLET_LIST_TEXT =
  'microtasks can delay visible paint until queued work finishes';
const INLINE_THREADS_BULLET_LIST_CONTENT = `- ${INLINE_THREADS_BULLET_LIST_TEXT}`;

const FIXTURE_MESSAGES: Record<
  'temporary' | 'persistent' | 'orderedList' | 'repeatedText' | 'bulletList',
  Message[]
> = {
  temporary: [
    {
      id: 'assistant-inline-threads-fixture',
      role: 'assistant',
      content: INLINE_THREADS_MESSAGE_CONTENT,
      timestamp: new Date('2026-04-05T09:00:00.000Z'),
    },
  ],
  persistent: [
    {
      id: 'assistant-inline-threads-persistent-fixture',
      role: 'assistant',
      content: INLINE_THREADS_MESSAGE_CONTENT,
      timestamp: new Date('2026-04-05T09:00:00.000Z'),
    },
  ],
  orderedList: [
    {
      id: 'assistant-inline-threads-ordered-list-fixture',
      role: 'assistant',
      content: INLINE_THREADS_ORDERED_LIST_CONTENT,
      timestamp: new Date('2026-04-05T09:00:00.000Z'),
    },
  ],
  repeatedText: [
    {
      id: 'assistant-inline-threads-repeated-text-fixture',
      role: 'assistant',
      content: INLINE_THREADS_REPEATED_CONTENT,
      timestamp: new Date('2026-04-05T09:00:00.000Z'),
    },
  ],
  bulletList: [
    {
      id: 'assistant-inline-threads-bullet-list-fixture',
      role: 'assistant',
      content: INLINE_THREADS_BULLET_LIST_CONTENT,
      timestamp: new Date('2026-04-05T09:00:00.000Z'),
    },
  ],
};

const HOME_E2E_FIXTURES: Record<string, HomeE2eFixture> = {
  'inline-threads': {
    key: 'inline-threads',
    chatMode: 'temporary',
    conversationId: null,
    messages: FIXTURE_MESSAGES.temporary,
  },
  'inline-threads-persistent': {
    key: 'inline-threads-persistent',
    chatMode: 'persistent',
    conversationId: 'conversation-inline-threads-fixture',
    messages: FIXTURE_MESSAGES.persistent,
  },
  'inline-threads-offset-render': {
    key: 'inline-threads-offset-render',
    chatMode: 'persistent',
    conversationId: 'conversation-inline-threads-offset-render-fixture',
    messages: FIXTURE_MESSAGES.orderedList,
    threads: [
      {
        threadId: 'persisted-thread-list-marker-1',
        sourceMessageId: 'assistant-inline-threads-ordered-list-fixture',
        highlightedText: `3. ${INLINE_THREADS_ORDERED_LIST_TEXT}`,
        startOffset: 1,
        endOffset: INLINE_THREADS_ORDERED_LIST_TEXT.length + 1,
      },
    ],
  },
  'inline-threads-repeated-text': {
    key: 'inline-threads-repeated-text',
    chatMode: 'persistent',
    conversationId: 'conversation-inline-threads-repeated-text-fixture',
    messages: FIXTURE_MESSAGES.repeatedText,
    threads: [
      {
        threadId: 'persisted-thread-repeated-text-1',
        sourceMessageId: 'assistant-inline-threads-repeated-text-fixture',
        highlightedText: INLINE_THREADS_REPEATED_TEXT,
        startOffset: INLINE_THREADS_REPEATED_SECOND_OFFSET,
        endOffset: INLINE_THREADS_REPEATED_SECOND_OFFSET + INLINE_THREADS_REPEATED_TEXT.length,
      },
    ],
  },
  'inline-threads-bullet-list': {
    key: 'inline-threads-bullet-list',
    chatMode: 'persistent',
    conversationId: 'conversation-inline-threads-bullet-list-fixture',
    messages: FIXTURE_MESSAGES.bulletList,
    threads: [
      {
        threadId: 'persisted-thread-bullet-list-1',
        sourceMessageId: 'assistant-inline-threads-bullet-list-fixture',
        highlightedText: `• ${INLINE_THREADS_BULLET_LIST_TEXT}`,
        startOffset: 1,
        endOffset: INLINE_THREADS_BULLET_LIST_TEXT.length + 1,
      },
    ],
  },
};

export function getHomeE2eFixture(key: string | null): HomeE2eFixture | null {
  if (!key) {
    return null;
  }

  return HOME_E2E_FIXTURES[key] ?? null;
}

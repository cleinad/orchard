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

const FIXTURE_MESSAGES: Record<'temporary' | 'persistent' | 'orderedList', Message[]> = {
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
};

export function getHomeE2eFixture(key: string | null): HomeE2eFixture | null {
  if (!key) {
    return null;
  }

  return HOME_E2E_FIXTURES[key] ?? null;
}

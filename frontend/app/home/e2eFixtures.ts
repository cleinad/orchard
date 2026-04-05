import type { Message } from '@/app/home/types';
import type { ChatMode } from '@/lib/chat-session';

export interface HomeE2eFixture {
  key: string;
  chatMode: ChatMode;
  conversationId: string | null;
  messages: Message[];
}

const INLINE_THREADS_MESSAGE_CONTENT = [
  'The event loop coordinates work between tasks, microtasks, and rendering.',
  'A useful rule of thumb is that microtasks run before the browser paints the next frame,',
  'which is why promise callbacks can update state before rendering catches up.',
].join(' ');

const FIXTURE_MESSAGES: Record<'temporary' | 'persistent', Message[]> = {
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
};

export function getHomeE2eFixture(key: string | null): HomeE2eFixture | null {
  if (!key) {
    return null;
  }

  return HOME_E2E_FIXTURES[key] ?? null;
}

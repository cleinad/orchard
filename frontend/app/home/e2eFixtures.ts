import type {
  BranchSelectionMap,
  ConversationBranch,
  Message,
} from '@/app/home/types';
import type { ThreadMeta } from '@/app/home/components/threadTypes';
import type { ChatMode } from '@/lib/chat-session';

export interface HomeE2eFixture {
  key: string;
  chatMode: ChatMode;
  conversationId: string | null;
  messages: Message[];
  branches?: ConversationBranch[];
  selectedBranchIds?: BranchSelectionMap;
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
const CONVERSATION_MAP_MESSAGES: Message[] = [
  {
    id: 'map-user-root',
    role: 'user',
    content: 'Give me two ways to explain delayed browser paint.',
    timestamp: new Date('2026-04-15T09:00:00.000Z'),
    previousMessageId: null,
  },
  {
    id: 'map-assistant-root',
    role: 'assistant',
    content: 'We can explain it as event-loop scheduling or as render-pipeline coordination.',
    timestamp: new Date('2026-04-15T09:00:10.000Z'),
    previousMessageId: 'map-user-root',
  },
  {
    id: 'map-main-user',
    role: 'user',
    content: 'Start with the event-loop explanation.',
    timestamp: new Date('2026-04-15T09:00:20.000Z'),
    previousMessageId: 'map-assistant-root',
  },
  {
    id: 'map-main-assistant',
    role: 'assistant',
    content: 'In the event loop, microtasks drain before the browser is allowed to paint.',
    timestamp: new Date('2026-04-15T09:00:30.000Z'),
    previousMessageId: 'map-main-user',
  },
  {
    id: 'map-alt-user',
    role: 'user',
    content: 'Take the render-pipeline route instead.',
    timestamp: new Date('2026-04-15T09:00:40.000Z'),
    previousMessageId: 'map-assistant-root',
  },
  {
    id: 'map-alt-assistant',
    role: 'assistant',
    content: 'Paint is deferred while layout, style, and queued microtasks are still unsettled.',
    timestamp: new Date('2026-04-15T09:00:50.000Z'),
    previousMessageId: 'map-alt-user',
  },
  {
    id: 'map-alt-nested-main-user',
    role: 'user',
    content: 'Now make that explanation more technical.',
    timestamp: new Date('2026-04-15T09:01:00.000Z'),
    previousMessageId: 'map-alt-assistant',
  },
  {
    id: 'map-alt-nested-main-assistant',
    role: 'assistant',
    content: 'The renderer cannot commit a frame while pending microtasks can still mutate the DOM.',
    timestamp: new Date('2026-04-15T09:01:10.000Z'),
    previousMessageId: 'map-alt-nested-main-user',
  },
  {
    id: 'map-alt-nested-alt-user',
    role: 'user',
    content: 'Make it more visual instead.',
    timestamp: new Date('2026-04-15T09:01:20.000Z'),
    previousMessageId: 'map-alt-assistant',
  },
  {
    id: 'map-alt-nested-alt-assistant',
    role: 'assistant',
    content: 'Imagine the frame waiting backstage while queued reactions keep rewriting the scene.',
    timestamp: new Date('2026-04-15T09:01:30.000Z'),
    previousMessageId: 'map-alt-nested-alt-user',
  },
];
const CONVERSATION_MAP_BRANCHES: ConversationBranch[] = [
  {
    id: 'map-branch-main',
    sourceMessageId: 'map-assistant-root',
    entryMessageId: 'map-main-user',
    title: 'Main',
    isMain: true,
    position: 0,
  },
  {
    id: 'map-branch-render-pipeline',
    sourceMessageId: 'map-assistant-root',
    entryMessageId: 'map-alt-user',
    title: 'Render pipeline',
    isMain: false,
    position: 1,
  },
  {
    id: 'map-branch-technical',
    sourceMessageId: 'map-alt-assistant',
    entryMessageId: 'map-alt-nested-main-user',
    title: 'Technical',
    isMain: true,
    position: 0,
  },
  {
    id: 'map-branch-visual',
    sourceMessageId: 'map-alt-assistant',
    entryMessageId: 'map-alt-nested-alt-user',
    title: 'Visual',
    isMain: false,
    position: 1,
  },
];

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
      previousMessageId: null,
    },
  ],
  persistent: [
    {
      id: 'assistant-inline-threads-persistent-fixture',
      role: 'assistant',
      content: INLINE_THREADS_MESSAGE_CONTENT,
      timestamp: new Date('2026-04-05T09:00:00.000Z'),
      previousMessageId: null,
    },
  ],
  orderedList: [
    {
      id: 'assistant-inline-threads-ordered-list-fixture',
      role: 'assistant',
      content: INLINE_THREADS_ORDERED_LIST_CONTENT,
      timestamp: new Date('2026-04-05T09:00:00.000Z'),
      previousMessageId: null,
    },
  ],
  repeatedText: [
    {
      id: 'assistant-inline-threads-repeated-text-fixture',
      role: 'assistant',
      content: INLINE_THREADS_REPEATED_CONTENT,
      timestamp: new Date('2026-04-05T09:00:00.000Z'),
      previousMessageId: null,
    },
  ],
  bulletList: [
    {
      id: 'assistant-inline-threads-bullet-list-fixture',
      role: 'assistant',
      content: INLINE_THREADS_BULLET_LIST_CONTENT,
      timestamp: new Date('2026-04-05T09:00:00.000Z'),
      previousMessageId: null,
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
  'conversation-map-temporary': {
    key: 'conversation-map-temporary',
    chatMode: 'temporary',
    conversationId: null,
    messages: CONVERSATION_MAP_MESSAGES,
    branches: CONVERSATION_MAP_BRANCHES,
    selectedBranchIds: {
      'map-assistant-root': 'map-branch-main',
      'map-alt-assistant': 'map-branch-technical',
    },
  },
};

export function getHomeE2eFixture(key: string | null): HomeE2eFixture | null {
  if (!key) {
    return null;
  }

  return HOME_E2E_FIXTURES[key] ?? null;
}

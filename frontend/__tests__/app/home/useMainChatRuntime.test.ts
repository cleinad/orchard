import { describe, expect, it, vi } from 'vitest';
import {
  applyCompletedPersistentRun,
  mergeCompletedPersistentRunReload,
  mergeReloadedBranchSelections,
  readChatStream,
  shouldReloadCompletedPersistentRun,
} from '@/app/home/components/useMainChatRuntime';
import {
  normalizePersistentConversationTranscript,
} from '@/app/home/components/persistentConversationCache';
import type {
  ConversationBranch,
  Message,
} from '@/app/home/types';
import type { ChatRunSnapshot } from '@/lib/chat-runs/protocol';
import type { SearchActivitySummary } from '@/lib/search/types';

function streamResponse(parts: Record<string, unknown>[]) {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const part of parts) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(part)}\n\n`));
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      },
    }),
    {
      headers: { 'content-type': 'text/event-stream' },
    }
  );
}

describe('readChatStream', () => {
  it('parses search activity data parts while streaming text', async () => {
    const activity: SearchActivitySummary = {
      collapsedLabel: 'Searching fresh results',
      events: [
        {
          type: 'search_started',
          query: 'OpenAI updates',
          attempt: 1,
        },
      ],
    };
    const onChunk = vi.fn();
    const onSearchActivity = vi.fn();

    const metadata = await readChatStream(
      streamResponse([
        {
          type: 'data-searchActivity',
          data: activity,
        },
        {
          type: 'text-delta',
          delta: 'Hello',
        },
        {
          type: 'data-chatMeta',
          data: {
            message: 'Hello',
            searchActivity: activity,
          },
        },
      ]),
      onChunk,
      { onSearchActivity }
    );

    expect(onChunk).toHaveBeenCalledWith('Hello');
    expect(onSearchActivity).toHaveBeenCalledWith(activity);
    expect(metadata).toMatchObject({
      message: 'Hello',
      searchActivity: activity,
    });
  });
});

describe('mergeReloadedBranchSelections', () => {
  const branches: ConversationBranch[] = [
    {
      id: 'branch-main',
      sourceMessageId: 'assistant-root',
      entryMessageId: 'user-main',
      title: 'Main',
      isMain: true,
      position: 0,
    },
    {
      id: 'branch-alternate',
      sourceMessageId: 'assistant-root',
      entryMessageId: 'user-alternate',
      title: 'Alternate',
      isMain: false,
      position: 1,
    },
  ];

  it('preserves a valid cached selection over the loaded default', () => {
    expect(mergeReloadedBranchSelections({
      loadedSelectedBranchIds: { 'assistant-root': 'branch-main' },
      latestSelectedBranchIds: { 'assistant-root': 'branch-alternate' },
      loadedBranches: branches,
      branchSourceMessageId: null,
      pendingBranchSelectionId: null,
    })).toEqual({ 'assistant-root': 'branch-alternate' });
  });

  it('falls back to the loaded default when the cached branch no longer exists', () => {
    expect(mergeReloadedBranchSelections({
      loadedSelectedBranchIds: { 'assistant-root': 'branch-main' },
      latestSelectedBranchIds: { 'assistant-root': 'branch-deleted' },
      loadedBranches: branches,
      branchSourceMessageId: null,
      pendingBranchSelectionId: null,
    })).toEqual({ 'assistant-root': 'branch-main' });
  });

  it('resolves an optimistic branch selection to the newly loaded branch', () => {
    expect(mergeReloadedBranchSelections({
      loadedSelectedBranchIds: { 'assistant-root': 'branch-main' },
      latestSelectedBranchIds: { 'assistant-root': 'branch-optimistic' },
      loadedBranches: branches,
      branchSourceMessageId: 'assistant-root',
      pendingBranchSelectionId: 'branch-optimistic',
    })).toEqual({ 'assistant-root': 'branch-alternate' });
  });
});

function createCompletedRun(
  overrides: Partial<ChatRunSnapshot> = {}
): ChatRunSnapshot {
  return {
    runId: 'run-1',
    mode: 'persistent',
    status: 'completed',
    target: {
      kind: 'main',
      chatId: 'conversation-1',
      conversationId: 'conversation-1',
      threadId: null,
      branchId: null,
      branchSourceMessageId: null,
      sourceMessageId: null,
      expectedPredecessorId: null,
    },
    userMessageId: 'user-1',
    assistantMessageId: 'assistant-1',
    createdThreadId: null,
    createdBranchId: null,
    response: 'Final response',
    search: null,
    searchActivity: null,
    title: {
      value: 'Conversation',
      source: 'generated',
      version: 1,
      runId: 'run-1',
    },
    subsystems: {
      response: 'completed',
      title: 'completed',
      search: 'skipped',
    },
    errorCode: null,
    errorMessage: null,
    acceptedAt: '2026-08-06T12:00:00.000Z',
    updatedAt: '2026-08-06T12:00:01.000Z',
    completedAt: '2026-08-06T12:00:01.000Z',
    expiresAt: null,
    ...overrides,
  };
}

function createMessage(
  id: string,
  role: Message['role'],
  content: string,
  previousMessageId: string | null
): Message {
  return {
    id,
    role,
    content,
    previousMessageId,
    timestamp: new Date('2026-08-06T12:00:00.000Z'),
  };
}

describe('completed persistent run reconciliation', () => {
  it('keeps a complete linear run local', () => {
    const run = createCompletedRun();
    const transcript = normalizePersistentConversationTranscript({
      messages: [
        createMessage('user-1', 'user', 'Question', null),
        createMessage('assistant-1', 'assistant', 'Streaming', 'user-1'),
      ],
      branches: [],
      selectedBranchIds: {},
      threadsMap: new Map(),
    });

    expect(shouldReloadCompletedPersistentRun(run, transcript)).toBe(false);
    expect(applyCompletedPersistentRun(transcript, run).messages[1]).toMatchObject({
      id: 'assistant-1',
      content: 'Final response',
      isStreaming: false,
      isError: false,
    });
  });

  it('reloads an ambiguous restored run missing terminal message identity', () => {
    const run = createCompletedRun();
    const transcript = normalizePersistentConversationTranscript({
      messages: [createMessage('older-message', 'assistant', 'Older', null)],
      branches: [],
      selectedBranchIds: {},
      threadsMap: new Map(),
    });

    expect(shouldReloadCompletedPersistentRun(run, transcript)).toBe(true);
  });

  it('finalizes a restored assistant without reordering later messages', () => {
    const run = createCompletedRun();
    const transcript = normalizePersistentConversationTranscript({
      messages: [
        createMessage('user-1', 'user', 'Question', null),
        createMessage('assistant-1', 'assistant', 'Streaming', 'user-1'),
        createMessage('later-user', 'user', 'Later question', 'assistant-1'),
      ],
      branches: [],
      selectedBranchIds: {},
      threadsMap: new Map(),
    });

    expect(
      applyCompletedPersistentRun(transcript, run).messages.map(
        (message) => message.id
      )
    ).toEqual(['user-1', 'assistant-1', 'later-user']);
  });

  it('always reloads one completed branch for canonical topology', () => {
    const run = createCompletedRun({
      target: {
        ...createCompletedRun().target,
        kind: 'branch',
        branchId: 'optimistic-branch',
        branchSourceMessageId: 'assistant-root',
      },
      createdBranchId: 'canonical-branch',
    });
    const transcript = normalizePersistentConversationTranscript({
      messages: [
        createMessage('user-1', 'user', 'Alternate question', 'assistant-root'),
        createMessage('assistant-1', 'assistant', 'Alternate answer', 'user-1'),
      ],
      branches: [],
      selectedBranchIds: {},
      threadsMap: new Map(),
    });

    expect(shouldReloadCompletedPersistentRun(run, transcript)).toBe(true);
  });

  it('keeps a newer branch when an older focused reload resolves last', () => {
    const sourceMessageId = 'assistant-root';
    const branchOneOptimistic: ConversationBranch = {
      id: 'branch-one',
      sourceMessageId,
      entryMessageId: 'branch-one-user',
      title: 'Branch one',
      isMain: false,
      position: 1,
    };
    const branchOneLoaded = { ...branchOneOptimistic, position: 2 };
    const branchTwoOptimistic: ConversationBranch = {
      id: 'branch-two',
      sourceMessageId,
      entryMessageId: 'branch-two-user',
      title: 'Branch two',
      isMain: false,
      position: 3,
    };
    const branchTwoLoaded = { ...branchTwoOptimistic, position: 4 };
    const messages = [
      createMessage('root-user', 'user', 'Root', null),
      createMessage(sourceMessageId, 'assistant', 'Root answer', 'root-user'),
    ];
    const firstReloadBaseline = normalizePersistentConversationTranscript({
      messages,
      branches: [branchOneOptimistic],
      selectedBranchIds: { [sourceMessageId]: branchOneOptimistic.id },
      threadsMap: new Map(),
    });
    const secondReloadBaseline = normalizePersistentConversationTranscript({
      messages,
      branches: [branchOneOptimistic, branchTwoOptimistic],
      selectedBranchIds: { [sourceMessageId]: branchTwoOptimistic.id },
      threadsMap: new Map(),
    });
    const readyMetadataStatus = {
      branches: { status: 'ready' as const },
      threads: { status: 'ready' as const },
      attachments: { status: 'ready' as const },
    };
    const afterSecondReload = mergeCompletedPersistentRunReload({
      loaded: {
        messages,
        branches: [branchOneLoaded, branchTwoLoaded],
        selectedBranchIds: { [sourceMessageId]: branchTwoLoaded.id },
        threadsMap: new Map(),
        metadataStatus: readyMetadataStatus,
      },
      current: secondReloadBaseline,
      baseline: secondReloadBaseline,
      branchSourceMessageId: sourceMessageId,
      pendingBranchSelectionId: branchTwoOptimistic.id,
    });
    const afterStaleFirstReload = mergeCompletedPersistentRunReload({
      loaded: {
        messages,
        branches: [branchOneLoaded],
        selectedBranchIds: { [sourceMessageId]: branchOneLoaded.id },
        threadsMap: new Map(),
        metadataStatus: readyMetadataStatus,
      },
      current: afterSecondReload,
      baseline: firstReloadBaseline,
      branchSourceMessageId: sourceMessageId,
      pendingBranchSelectionId: branchOneOptimistic.id,
    });

    expect(
      afterStaleFirstReload.branches.map((branch) => branch.id)
    ).toEqual(['branch-one', 'branch-two']);
    expect(afterStaleFirstReload.selectedBranchIds).toEqual({
      [sourceMessageId]: 'branch-two',
    });
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadStoredChatRuns, storeChatRuns } from '@/lib/chat-runs/storage';
import { createQueuedChatRunSnapshot } from '@/lib/chat-runs/protocol';

function createStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

describe('chat run browser storage', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { sessionStorage: createStorage() });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('keeps temporary snapshots locally but drops persistent terminal snapshots', () => {
    const identifiers = {
      runId: '10000000-0000-4000-8000-000000000001',
      userMessageId: '20000000-0000-4000-8000-000000000001',
      assistantMessageId: '30000000-0000-4000-8000-000000000001',
    };
    const target = {
      kind: 'main' as const,
      chatId: 'temporary-session',
      conversationId: null,
      threadId: null,
      branchId: null,
      branchSourceMessageId: null,
      sourceMessageId: null,
      expectedPredecessorId: null,
    };
    const temporary = {
      ...createQueuedChatRunSnapshot({
        identifiers,
        mode: 'temporary',
        target,
        fallbackTitle: 'Fallback',
      }),
      status: 'completed' as const,
    };
    const persistent = {
      ...temporary,
      runId: '40000000-0000-4000-8000-000000000001',
      mode: 'persistent' as const,
      target: { ...target, chatId: 'conversation', conversationId: 'conversation' },
      subsystems: { ...temporary.subsystems, title: 'completed' as const },
    };

    storeChatRuns([temporary, persistent]);

    expect(loadStoredChatRuns().map((run) => run.runId)).toEqual([temporary.runId]);
    expect('localStorage' in window).toBe(false);
  });

  it('keeps a terminal persistent response until its title settles', () => {
    const queued = createQueuedChatRunSnapshot({
      identifiers: {
        runId: '50000000-0000-4000-8000-000000000001',
        userMessageId: '60000000-0000-4000-8000-000000000001',
        assistantMessageId: '70000000-0000-4000-8000-000000000001',
      },
      mode: 'persistent',
      target: {
        kind: 'main',
        chatId: 'conversation',
        conversationId: 'conversation',
        threadId: null,
        branchId: null,
        branchSourceMessageId: null,
        sourceMessageId: null,
        expectedPredecessorId: null,
      },
      fallbackTitle: 'Fallback',
    });
    const titlePending = {
      ...queued,
      status: 'completed' as const,
      acceptedAt: '2026-07-20T01:00:00.000Z',
      subsystems: { ...queued.subsystems, response: 'completed' as const, title: 'running' as const },
    };

    storeChatRuns([titlePending]);
    expect(loadStoredChatRuns()).toEqual([titlePending]);

    storeChatRuns([{
      ...titlePending,
      subsystems: { ...titlePending.subsystems, title: 'completed' as const },
    }]);
    expect(loadStoredChatRuns()).toEqual([]);
  });
});

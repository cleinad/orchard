import { describe, expect, it } from 'vitest';
import {
  chatRunReducer,
  buildChatRunTarget,
  createQueuedChatRunSnapshot,
  findActiveMainChatRun,
  getChatRunScopeKey,
  isTerminalChatRunStatus,
} from '@/lib/chat-runs/protocol';
import { hashChatRunPayload, validateChatRunMetadata } from '@/lib/chat-runs/server';

const identifiers = {
  runId: '10000000-0000-4000-8000-000000000001',
  userMessageId: '20000000-0000-4000-8000-000000000001',
  assistantMessageId: '30000000-0000-4000-8000-000000000001',
};

const target = buildChatRunTarget({
  mode: 'persistent',
  conversationId: '40000000-0000-4000-8000-000000000001',
  temporarySessionId: null,
  threadId: null,
  branchId: null,
  branchSourceMessageId: null,
  sourceMessageId: null,
  expectedPredecessorId: '50000000-0000-4000-8000-000000000001',
});

describe('chat run protocol', () => {
  it('follows the shared happy-path state machine', () => {
    const queued = createQueuedChatRunSnapshot({
      identifiers,
      mode: 'persistent',
      target,
      fallbackTitle: 'Fallback',
    });
    const submitting = chatRunReducer(queued, { type: 'submitted' });
    const streaming = chatRunReducer(submitting, { type: 'streaming' });
    const finalizing = chatRunReducer(streaming, { type: 'finalizing' });
    const completed = chatRunReducer(finalizing, {
      type: 'reconciled',
      snapshot: { ...finalizing, status: 'completed', completedAt: finalizing.updatedAt },
    });

    expect([
      queued.status,
      submitting.status,
      streaming.status,
      finalizing.status,
      completed.status,
    ]).toEqual(['queued', 'submitting', 'streaming', 'finalizing', 'completed']);
    expect(streaming.subsystems.response).toBe('running');
    expect(queued.acceptedAt).toBeNull();
    expect(isTerminalChatRunStatus(completed.status)).toBe(true);
  });

  it('does not let a late local event replace a terminal authoritative state', () => {
    const queued = createQueuedChatRunSnapshot({
      identifiers,
      mode: 'temporary',
      target: { ...target, chatId: 'temporary-session', conversationId: null },
      fallbackTitle: 'Fallback',
    });
    const cancelled = chatRunReducer(queued, { type: 'cancelled' });
    expect(chatRunReducer(cancelled, { type: 'streaming' })).toBe(cancelled);
    expect(cancelled.subsystems).toEqual({
      response: 'cancelled',
      title: 'pending',
      search: 'pending',
    });
  });

  it('hashes semantically identical payload objects identically', async () => {
    await expect(hashChatRunPayload({ b: 2, a: { d: 4, c: 3 } }))
      .resolves.toBe(await hashChatRunPayload({ a: { c: 3, d: 4 }, b: 2 }));
    await expect(hashChatRunPayload({ a: 1 }))
      .resolves.not.toBe(await hashChatRunPayload({ a: 2 }));
  });

  it('scopes concurrency to the immutable path tail', () => {
    expect(getChatRunScopeKey(target)).toBe(
      '40000000-0000-4000-8000-000000000001:main:50000000-0000-4000-8000-000000000001'
    );
    expect(getChatRunScopeKey({
      ...target,
      kind: 'thread',
      threadId: '60000000-0000-4000-8000-000000000001',
    })).toContain(':thread:60000000-0000-4000-8000-000000000001');
  });

  it('selects only unsettled main or branch runs for the chat composer', () => {
    const queued = createQueuedChatRunSnapshot({
      identifiers,
      mode: 'persistent',
      target,
      fallbackTitle: 'Fallback',
    });
    const threadRun = {
      ...queued,
      runId: '10000000-0000-4000-8000-000000000002',
      target: {
        ...target,
        kind: 'thread' as const,
        threadId: '60000000-0000-4000-8000-000000000001',
      },
    };
    const completedRun = {
      ...queued,
      runId: '10000000-0000-4000-8000-000000000003',
      status: 'completed' as const,
    };

    expect(findActiveMainChatRun(
      [threadRun, completedRun, queued],
      target.chatId
    )).toBe(queued);
    expect(findActiveMainChatRun([threadRun], target.chatId)).toBeNull();
    expect(findActiveMainChatRun([queued], 'another-chat')).toBeNull();
  });

  it('requires deterministic UUID identifiers but allows an opaque session id', () => {
    expect(validateChatRunMetadata({ ...identifiers, temporarySessionId: 'legacy-temp-id' }))
      .toBeNull();
    expect(validateChatRunMetadata({ ...identifiers, runId: 'not-a-uuid' }))
      .toBe('runId must be a UUID');
  });
});

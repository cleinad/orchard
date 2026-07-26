import { describe, expect, it, vi } from 'vitest';
import {
  ChatRunApiError,
  fetchChatRunSnapshot,
  pollChatRun,
} from '@/lib/chat-runs/reconciliation';
import {
  createQueuedChatRunSnapshot,
  type ChatRunSnapshot,
} from '@/lib/chat-runs/protocol';

const identifiers = {
  runId: '10000000-0000-4000-8000-000000000001',
  userMessageId: '20000000-0000-4000-8000-000000000001',
  assistantMessageId: '30000000-0000-4000-8000-000000000001',
};

function runSnapshot(status: ChatRunSnapshot['status'] = 'streaming') {
  const queued = createQueuedChatRunSnapshot({
    identifiers,
    mode: 'persistent',
    target: {
      kind: 'main',
      chatId: '40000000-0000-4000-8000-000000000001',
      conversationId: '40000000-0000-4000-8000-000000000001',
      threadId: null,
      branchId: null,
      branchSourceMessageId: null,
      sourceMessageId: null,
      expectedPredecessorId: null,
    },
    fallbackTitle: 'Fallback',
  });
  return {
    ...queued,
    status,
    acceptedAt: '2026-07-20T01:00:00.000Z',
  };
}

describe('chat run reconciliation', () => {
  it('treats only a typed run_not_found response as absence', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: 'Run not found', code: 'run_not_found' }),
      { status: 404, headers: { 'content-type': 'application/json' } }
    ));

    await expect(fetchChatRunSnapshot(identifiers.runId, { fetchImpl })).resolves.toBeNull();
  });

  it('does not turn a framework HTML 404 into a missing run', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('<h1>Not found</h1>', {
      status: 404,
      headers: { 'content-type': 'text/html' },
    }));

    await expect(fetchChatRunSnapshot(identifiers.runId, { fetchImpl }))
      .rejects.toMatchObject({ code: 'unexpected_response', status: 404 });
  });

  it('preserves typed lookup failures', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: 'Failed to load chat run', code: 'run_lookup_failed' }),
      { status: 500, headers: { 'content-type': 'application/json' } }
    ));

    const error = await fetchChatRunSnapshot(identifiers.runId, { fetchImpl })
      .catch((caught) => caught);
    expect(error).toBeInstanceOf(ChatRunApiError);
    expect(error).toMatchObject({ code: 'run_lookup_failed', status: 500 });
  });

  it('allows a pre-accept not-found window to become an authoritative run', async () => {
    let clock = 0;
    const accepted = runSnapshot('completed');
    const load = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(accepted);

    const result = await pollChatRun({
      load,
      isSettled: (snapshot) => snapshot.status === 'completed',
      missingGraceMs: 1_000,
      timeoutMs: 5_000,
      now: () => clock,
      wait: async (delayMs) => { clock += delayMs; },
    });

    expect(result).toEqual({ kind: 'settled', snapshot: accepted });
    expect(load).toHaveBeenCalledTimes(3);
  });

  it('classifies sustained absence separately from timeout', async () => {
    let missingClock = 0;
    const missing = await pollChatRun({
      load: async () => null,
      isSettled: () => false,
      missingGraceMs: 500,
      timeoutMs: 5_000,
      now: () => missingClock,
      wait: async (delayMs) => { missingClock += delayMs; },
    });
    expect(missing.kind).toBe('missing');

    let timeoutClock = 0;
    const streaming = runSnapshot('streaming');
    const timedOut = await pollChatRun({
      load: async () => streaming,
      isSettled: () => false,
      missingGraceMs: 500,
      timeoutMs: 500,
      now: () => timeoutClock,
      wait: async (delayMs) => { timeoutClock += delayMs; },
    });
    expect(timedOut).toEqual({ kind: 'timed_out', latestSnapshot: streaming });
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createMockSupabase } from '../helpers/mock-supabase';

const mockCreateSupabaseServerClient = vi.fn();
vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: () => mockCreateSupabaseServerClient(),
}));

const runId = '10000000-0000-4000-8000-000000000001';
const conversationId = '20000000-0000-4000-8000-000000000001';
const baseRow = {
  id: runId,
  target: {
    kind: 'main',
    chatId: conversationId,
    conversationId,
    threadId: null,
    branchId: null,
    branchSourceMessageId: null,
    sourceMessageId: null,
    expectedPredecessorId: null,
  },
  user_message_id: '30000000-0000-4000-8000-000000000001',
  assistant_message_id: '40000000-0000-4000-8000-000000000001',
  status: 'streaming',
  response_status: 'running',
  title_status: 'running',
  search_status: 'skipped',
  memory_status: 'pending',
  response_text: null,
  title: 'Fallback',
  title_source: 'fallback',
  title_version: 0,
  accepted_at: '2026-07-18T10:00:00.000Z',
  updated_at: '2026-07-18T10:00:01.000Z',
  completed_at: null,
};

function authenticatedClient(tables: Record<string, {
  rows: object[];
  queryError?: unknown;
  mutateError?: unknown;
}>) {
  const { client, tracker } = createMockSupabase({ tables });
  return {
    supabase: {
      ...client,
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-1' } },
          error: null,
        }),
      },
    },
    tracker,
  };
}

describe('persistent chat run reconciliation routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns an authoritative persistent snapshot and records reconciliation', async () => {
    const { supabase, tracker } = authenticatedClient({
      chat_runs: { rows: [{ ...baseRow, status: 'completed', response_text: 'Done' }] },
      chat_run_events: { rows: [] },
    });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);
    const { GET } = await import('@/app/api/chat-runs/[runId]/route');
    const response = await GET(
      new NextRequest(`http://localhost/api/chat-runs/${runId}`, {
        headers: { 'x-chat-run-reconciliation': 'initial' },
      }),
      { params: Promise.resolve({ runId }) }
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.run).toMatchObject({ mode: 'persistent', response: 'Done' });
    expect(data.run.subsystems).toEqual({
      response: 'running',
      title: 'running',
      search: 'skipped',
    });
    expect(String(tracker.selects('chat_runs')[0].args)).not.toContain('memory_status');
    expect(tracker.inserts('chat_run_events')[0].args).toMatchObject({
      run_id: runId,
      event: 'client_reconciled',
    });
  });

  it('marks a persistent run cancelled only through the explicit endpoint', async () => {
    const {
      abortActiveChatRun,
      registerActiveChatRun,
    } = await import('@/lib/chat-runs/active-run-registry');
    const controller = registerActiveChatRun(runId);
    const { supabase, tracker } = authenticatedClient({
      chat_runs: { rows: [baseRow] },
      chat_run_events: { rows: [] },
    });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);
    const { POST } = await import('@/app/api/chat-runs/[runId]/cancel/route');
    const response = await POST(
      new NextRequest(`http://localhost/api/chat-runs/${runId}/cancel`, { method: 'POST' }),
      { params: Promise.resolve({ runId }) }
    );

    expect(response.status).toBe(200);
    expect(tracker.updates('chat_runs')[0].args).toMatchObject({
      status: 'cancelled',
      response_status: 'cancelled',
      title_status: 'cancelled',
      search_status: 'skipped',
    });
    expect(tracker.updates('chat_runs')[0].args).not.toHaveProperty('memory_status');
    expect(tracker.updates('chat_runs')[0].filters).toMatchObject({
      'in:status': ['queued', 'submitting', 'streaming', 'finalizing', 'interrupted'],
      'neq:response_status': 'completed',
    });
    expect(controller.signal.aborted).toBe(true);
    expect(abortActiveChatRun(runId)).toBe(false);
  });

  it('does not expose temporary state through the persistent reconciliation API', async () => {
    const { supabase, tracker } = authenticatedClient({
      chat_runs: { rows: [] },
      chat_run_events: { rows: [] },
    });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);
    const { GET } = await import('@/app/api/chat-runs/[runId]/route');
    const response = await GET(
      new NextRequest(`http://localhost/api/chat-runs/${runId}`),
      { params: Promise.resolve({ runId }) }
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: 'run_not_found' });
    expect(tracker.queries.some((query) => query.table !== 'chat_runs')).toBe(false);
    expect(tracker.inserts('chat_run_events')).toHaveLength(0);
  });

  it('returns a typed missing response from the cancellation endpoint', async () => {
    const { supabase } = authenticatedClient({
      chat_runs: { rows: [] },
      chat_run_events: { rows: [] },
    });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);
    const { POST } = await import('@/app/api/chat-runs/[runId]/cancel/route');
    const response = await POST(
      new NextRequest(`http://localhost/api/chat-runs/${runId}/cancel`, { method: 'POST' }),
      { params: Promise.resolve({ runId }) }
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: 'run_not_found' });
  });

  it('returns a typed lookup failure from the cancellation endpoint', async () => {
    const { supabase } = authenticatedClient({
      chat_runs: { rows: [], queryError: { message: 'database unavailable' } },
      chat_run_events: { rows: [] },
    });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);
    const { POST } = await import('@/app/api/chat-runs/[runId]/cancel/route');
    const response = await POST(
      new NextRequest(`http://localhost/api/chat-runs/${runId}/cancel`, { method: 'POST' }),
      { params: Promise.resolve({ runId }) }
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ code: 'run_lookup_failed' });
  });

  it('returns a typed mutation failure from the cancellation endpoint', async () => {
    const { supabase } = authenticatedClient({
      chat_runs: { rows: [baseRow], mutateError: { message: 'write unavailable' } },
      chat_run_events: { rows: [] },
    });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);
    const { POST } = await import('@/app/api/chat-runs/[runId]/cancel/route');
    const response = await POST(
      new NextRequest(`http://localhost/api/chat-runs/${runId}/cancel`, { method: 'POST' }),
      { params: Promise.resolve({ runId }) }
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ code: 'run_cancel_failed' });
  });

  it('does not record a lifecycle event for every polling request', async () => {
    const { supabase, tracker } = authenticatedClient({
      chat_runs: { rows: [baseRow] },
      chat_run_events: { rows: [] },
    });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);
    const { GET } = await import('@/app/api/chat-runs/[runId]/route');
    const response = await GET(
      new NextRequest(`http://localhost/api/chat-runs/${runId}`),
      { params: Promise.resolve({ runId }) }
    );

    expect(response.status).toBe(200);
    expect(tracker.inserts('chat_run_events')).toHaveLength(0);
  });

  it('returns a typed server error instead of treating a query failure as absence', async () => {
    const { supabase } = authenticatedClient({
      chat_runs: { rows: [], queryError: { message: 'database unavailable' } },
      chat_run_events: { rows: [] },
    });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);
    const { GET } = await import('@/app/api/chat-runs/[runId]/route');
    const response = await GET(
      new NextRequest(`http://localhost/api/chat-runs/${runId}`),
      { params: Promise.resolve({ runId }) }
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ code: 'run_lookup_failed' });
  });
});

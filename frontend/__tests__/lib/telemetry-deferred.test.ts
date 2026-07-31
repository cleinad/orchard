import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockAfter = vi.hoisted(() => vi.fn());
const mockRecordModelUsageCall = vi.hoisted(() => vi.fn());
const mockStartModelUsageCall = vi.hoisted(() => vi.fn());

vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({
  after: (callback: () => unknown) => mockAfter(callback),
}));
vi.mock('@/lib/telemetry/server', () => ({
  recordModelUsageCall: (...args: unknown[]) => mockRecordModelUsageCall(...args),
  startModelUsageCall: (...args: unknown[]) => mockStartModelUsageCall(...args),
}));

import { startDeferredModelUsageCall } from '@/lib/telemetry/deferred';

const baseContext = {
  userId: '11111111-1111-4111-8111-111111111111',
  requestId: '22222222-2222-4222-8222-222222222222',
  runId: null,
  callKind: 'mentor_generation' as const,
  attempt: 0,
  chatMode: null,
  surface: 'mentor' as const,
  requestedModelId: null,
  resolvedModelId: 'gpt-5.5',
  provider: 'openai',
  providerModelId: 'gpt-5.5',
};

describe('deferred model usage recording', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAfter.mockImplementation((callback: () => unknown) => callback());
    mockStartModelUsageCall.mockReturnValue({
      ...baseContext,
      id: '33333333-3333-4333-8333-333333333333',
      startedAt: new Date('2026-07-31T00:00:00.000Z'),
    });
    mockRecordModelUsageCall.mockResolvedValue(true);
  });

  it('defers one terminal write and ignores duplicate callbacks', () => {
    const recordTerminal = startDeferredModelUsageCall(baseContext);
    const terminal = {
      status: 'completed' as const,
      finishReason: 'stop',
      completedAt: new Date('2026-07-31T00:00:00.100Z'),
    };

    recordTerminal(terminal);
    recordTerminal({ status: 'failed' });

    expect(mockStartModelUsageCall).toHaveBeenCalledWith(baseContext);
    expect(mockAfter).toHaveBeenCalledTimes(1);
    expect(mockRecordModelUsageCall).toHaveBeenCalledWith(
      expect.objectContaining({
        id: '33333333-3333-4333-8333-333333333333',
      }),
      terminal
    );
  });

  it('falls back to a detached write when the response hook is unavailable', () => {
    mockAfter.mockImplementation(() => {
      throw new Error('outside request scope');
    });
    const recordTerminal = startDeferredModelUsageCall(baseContext);

    expect(() => recordTerminal({ status: 'failed' })).not.toThrow();
    expect(mockRecordModelUsageCall).toHaveBeenCalledTimes(1);
  });

  it('never lets start failures escape into provider generation', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mockStartModelUsageCall.mockImplementation(() => {
      throw new Error('uuid unavailable');
    });

    const recordTerminal = startDeferredModelUsageCall(baseContext);

    expect(() => recordTerminal({ status: 'failed' })).not.toThrow();
    expect(mockRecordModelUsageCall).not.toHaveBeenCalled();
  });
});

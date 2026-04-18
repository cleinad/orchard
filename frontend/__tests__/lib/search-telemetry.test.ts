import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSearchTelemetry } from '@/lib/search/telemetry';

describe('search telemetry', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('includes a query preview in development logs', () => {
    vi.stubEnv('NODE_ENV', 'development');

    const info = vi.fn();
    const error = vi.fn();
    const telemetry = createSearchTelemetry({
      traceId: 'trace-1',
      conversationId: 'conv-1',
      query: ' latest   OpenAI pricing updates ',
      logger: { info, error },
    });

    telemetry.logRequestStarted({ searchMode: 'required' });

    expect(info).toHaveBeenCalledWith(
      '[search]',
      expect.objectContaining({
        event: 'search.request_started',
        traceId: 'trace-1',
        conversationId: 'conv-1',
        searchMode: 'required',
        queryPreview: 'latest OpenAI pricing updates',
      })
    );

    const event = info.mock.calls[0]?.[1];
    expect(event.queryHash).toEqual(expect.any(String));
    expect(event.queryHash).toHaveLength(16);
  });

  it('omits the query preview in production logs', () => {
    vi.stubEnv('NODE_ENV', 'production');

    const info = vi.fn();
    const error = vi.fn();
    const telemetry = createSearchTelemetry({
      traceId: 'trace-2',
      conversationId: null,
      query: 'latest OpenAI pricing updates',
      logger: { info, error },
    });

    telemetry.logRequestStarted({ searchMode: 'required' });

    expect(info).toHaveBeenCalledWith(
      '[search]',
      expect.objectContaining({
        event: 'search.request_started',
        traceId: 'trace-2',
        conversationId: null,
        searchMode: 'required',
      })
    );

    const event = info.mock.calls[0]?.[1];
    expect(event.queryPreview).toBeUndefined();
  });
});

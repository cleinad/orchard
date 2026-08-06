import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockCreateSupabaseServerClient = vi.hoisted(() => vi.fn());
const mockRedirect = vi.hoisted(() =>
  vi.fn((location: string) => {
    throw new Error(`NEXT_REDIRECT:${location}`);
  })
);

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: () => mockCreateSupabaseServerClient(),
}));
vi.mock('next/navigation', () => ({
  redirect: (location: string) => mockRedirect(location),
}));

import { getSettingsViewer } from '@/app/settings/data';

interface ClientOptions {
  claims?: Record<string, unknown> | null;
  claimsError?: unknown;
  claimsThrows?: boolean;
  queryResult?: {
    data: Record<string, unknown> | null;
    error: unknown;
  };
  queryThrows?: boolean;
  resolveOnAbort?: boolean;
}

function createClient({
  claims = {
    sub: 'user-1',
    email: 'viewer@example.com',
  },
  claimsError = null,
  claimsThrows = false,
  queryResult = {
    data: {
      full_name: '  Viewer Name  ',
      global_instructions: '  Use examples.\r\n  ',
    },
    error: null,
  },
  queryThrows = false,
  resolveOnAbort = false,
}: ClientOptions = {}) {
  const maybeSingle = vi.fn();
  const abortSignal = vi.fn((signal: AbortSignal) => {
    if (resolveOnAbort) {
      maybeSingle.mockImplementation(
        () =>
          new Promise((resolve) => {
            signal.addEventListener(
              'abort',
              () =>
                resolve({
                  data: null,
                  error: { message: 'The operation was aborted' },
                }),
              { once: true }
            );
          })
      );
    } else if (queryThrows) {
      maybeSingle.mockRejectedValue(new Error('profile query failed'));
    } else {
      maybeSingle.mockResolvedValue(queryResult);
    }

    return { maybeSingle };
  });
  const eq = vi.fn(() => ({ abortSignal }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  const getClaims = claimsThrows
    ? vi.fn().mockRejectedValue(new Error('malformed token'))
    : vi.fn().mockResolvedValue({
        data: claims === null ? null : { claims },
        error: claimsError,
      });

  return {
    client: {
      auth: { getClaims },
      from,
    },
    spies: {
      getClaims,
      from,
      select,
      eq,
      abortSignal,
      maybeSingle,
    },
  };
}

describe('settings viewer loader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('verifies claims and performs one scoped profile query', async () => {
    const { client, spies } = createClient();
    mockCreateSupabaseServerClient.mockResolvedValue(client);

    const result = await getSettingsViewer();

    expect(result).toEqual({
      status: 'ready',
      viewer: {
        id: 'user-1',
        email: 'viewer@example.com',
        fullName: 'Viewer Name',
        globalInstructions: 'Use examples.',
      },
    });
    expect(spies.getClaims).toHaveBeenCalledTimes(1);
    expect(spies.from).toHaveBeenCalledTimes(1);
    expect(spies.from).toHaveBeenCalledWith('profiles');
    expect(spies.select).toHaveBeenCalledTimes(1);
    expect(spies.select).toHaveBeenCalledWith(
      'full_name, global_instructions'
    );
    expect(spies.eq).toHaveBeenCalledTimes(1);
    expect(spies.eq).toHaveBeenCalledWith('id', 'user-1');
    expect(spies.abortSignal).toHaveBeenCalledTimes(1);
    expect(spies.abortSignal).toHaveBeenCalledWith(
      expect.any(AbortSignal)
    );
    expect(spies.maybeSingle).toHaveBeenCalledTimes(1);
  });

  it('returns the missing-profile state without issuing another query', async () => {
    const { client, spies } = createClient({
      queryResult: { data: null, error: null },
    });
    mockCreateSupabaseServerClient.mockResolvedValue(client);

    await expect(getSettingsViewer()).resolves.toEqual({
      status: 'profile-missing',
      viewer: {
        id: 'user-1',
        email: 'viewer@example.com',
      },
    });
    expect(spies.from).toHaveBeenCalledTimes(1);
    expect(spies.maybeSingle).toHaveBeenCalledTimes(1);
  });

  it.each([
    {
      label: 'PostgREST error',
      options: {
        queryResult: {
          data: null,
          error: { message: 'temporary upstream failure' },
        },
      },
    },
    {
      label: 'thrown query error',
      options: { queryThrows: true },
    },
  ])('degrades gracefully after a $label', async ({ options }) => {
    const { client } = createClient(options);
    mockCreateSupabaseServerClient.mockResolvedValue(client);

    await expect(getSettingsViewer()).resolves.toEqual({
      status: 'profile-unavailable',
      reason: 'error',
      viewer: {
        id: 'user-1',
        email: 'viewer@example.com',
      },
    });
  });

  it('aborts a slow profile query and reports a timeout', async () => {
    vi.useFakeTimers();
    const { client, spies } = createClient({ resolveOnAbort: true });
    mockCreateSupabaseServerClient.mockResolvedValue(client);

    const resultPromise = getSettingsViewer();
    await vi.advanceTimersByTimeAsync(2_000);

    await expect(resultPromise).resolves.toEqual({
      status: 'profile-unavailable',
      reason: 'timeout',
      viewer: {
        id: 'user-1',
        email: 'viewer@example.com',
      },
    });
    const signal = spies.abortSignal.mock.calls[0]?.[0];
    expect(signal?.aborted).toBe(true);
    expect(spies.maybeSingle).toHaveBeenCalledTimes(1);
  });

  it.each([
    {
      label: 'claims error',
      options: { claims: null, claimsError: new Error('invalid session') },
    },
    {
      label: 'missing subject',
      options: { claims: { email: 'viewer@example.com' } },
    },
    {
      label: 'empty subject',
      options: { claims: { sub: '', email: 'viewer@example.com' } },
    },
    {
      label: 'malformed email',
      options: { claims: { sub: 'user-1', email: 42 } },
    },
    {
      label: 'thrown claims verification',
      options: { claimsThrows: true },
    },
  ])('redirects for $label before querying profiles', async ({ options }) => {
    const { client, spies } = createClient(options);
    mockCreateSupabaseServerClient.mockResolvedValue(client);

    await expect(getSettingsViewer()).rejects.toThrow(
      'NEXT_REDIRECT:/login?redirect=%2Fsettings'
    );
    expect(mockRedirect).toHaveBeenCalledWith(
      '/login?redirect=%2Fsettings'
    );
    expect(spies.from).not.toHaveBeenCalled();
  });

  it('accepts a missing email claim and keeps the display value nullable', async () => {
    const { client } = createClient({
      claims: { sub: 'user-1' },
    });
    mockCreateSupabaseServerClient.mockResolvedValue(client);

    const result = await getSettingsViewer();

    expect(result.viewer.email).toBeNull();
  });
});

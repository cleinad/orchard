import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCreateSupabaseServerClient = vi.fn();

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: () => mockCreateSupabaseServerClient(),
}));

function createRouteSupabase(authenticated: boolean) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: authenticated ? { id: 'user-1' } : null },
        error: null,
      }),
    },
  };
}

async function loadPostHandler() {
  vi.resetModules();
  const { POST } = await import('@/app/api/deepgram/token/route');
  return POST;
}

describe('deepgram token route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    delete process.env.DEEPGRAM_API_KEY;
  });

  it('rejects unauthenticated requests', async () => {
    mockCreateSupabaseServerClient.mockResolvedValue(createRouteSupabase(false));

    const POST = await loadPostHandler();
    const response = await POST();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
  });

  it('returns 503 when the Deepgram API key is missing', async () => {
    mockCreateSupabaseServerClient.mockResolvedValue(createRouteSupabase(true));

    const POST = await loadPostHandler();
    const response = await POST();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: 'Deepgram API key not configured',
    });
  });

  it('creates a temporary Deepgram token for authenticated users', async () => {
    process.env.DEEPGRAM_API_KEY = 'test-deepgram-key';
    mockCreateSupabaseServerClient.mockResolvedValue(createRouteSupabase(true));
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          access_token: 'temporary-token',
          expires_in: 30,
        })
      )
    );

    const POST = await loadPostHandler();
    const response = await POST();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      accessToken: 'temporary-token',
      expiresIn: 30,
    });
    expect(fetch).toHaveBeenCalledWith(
      'https://api.deepgram.com/v1/auth/grant',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Token test-deepgram-key',
        }),
        body: '{}',
      })
    );
  });

  it('returns 502 when Deepgram rejects the token request', async () => {
    process.env.DEEPGRAM_API_KEY = 'test-deepgram-key';
    mockCreateSupabaseServerClient.mockResolvedValue(createRouteSupabase(true));
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ error: 'Forbidden' }, { status: 403 }))
    );

    const POST = await loadPostHandler();
    const response = await POST();

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: 'Failed to create Deepgram token',
    });
  });

  it('returns 502 when Deepgram returns a malformed token response', async () => {
    process.env.DEEPGRAM_API_KEY = 'test-deepgram-key';
    mockCreateSupabaseServerClient.mockResolvedValue(createRouteSupabase(true));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({})));

    const POST = await loadPostHandler();
    const response = await POST();

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: 'Invalid Deepgram token response',
    });
  });
});

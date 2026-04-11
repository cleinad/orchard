import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

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
  const { POST } = await import('@/app/api/tts/route');
  return POST;
}

describe('tts route auth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.ELEVENLABS_API_KEY;
    delete process.env.ELEVENLABS_VOICE_ID;
    vi.unstubAllGlobals();
  });

  it('rejects unauthenticated requests', async () => {
    mockCreateSupabaseServerClient.mockResolvedValue(createRouteSupabase(false));

    const POST = await loadPostHandler();
    const response = await POST(
      new NextRequest('http://localhost/api/tts', {
        method: 'POST',
        body: JSON.stringify({ text: 'Hello' }),
        headers: {
          'content-type': 'application/json',
        },
      })
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
  });

  it('returns 500 when the ElevenLabs API key is missing', async () => {
    mockCreateSupabaseServerClient.mockResolvedValue(createRouteSupabase(true));

    const POST = await loadPostHandler();
    const response = await POST(
      new NextRequest('http://localhost/api/tts', {
        method: 'POST',
        body: JSON.stringify({ text: 'Hello' }),
        headers: {
          'content-type': 'application/json',
        },
      })
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'ElevenLabs API key not configured' });
  });

  it('returns 400 for empty text after auth succeeds', async () => {
    process.env.ELEVENLABS_API_KEY = 'test-key';
    mockCreateSupabaseServerClient.mockResolvedValue(createRouteSupabase(true));

    const POST = await loadPostHandler();
    const response = await POST(
      new NextRequest('http://localhost/api/tts', {
        method: 'POST',
        body: JSON.stringify({ text: '   ' }),
        headers: {
          'content-type': 'application/json',
        },
      })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Text is required' });
  });

  it('streams audio for authenticated requests with valid input', async () => {
    process.env.ELEVENLABS_API_KEY = 'test-key';
    mockCreateSupabaseServerClient.mockResolvedValue(createRouteSupabase(true));
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('audio-bytes', {
          status: 200,
          headers: {
            'Content-Type': 'audio/mpeg',
          },
        })
      )
    );

    const POST = await loadPostHandler();
    const response = await POST(
      new NextRequest('http://localhost/api/tts', {
        method: 'POST',
        body: JSON.stringify({ text: 'Hello there' }),
        headers: {
          'content-type': 'application/json',
        },
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('audio/mpeg');
    expect(await response.text()).toBe('audio-bytes');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

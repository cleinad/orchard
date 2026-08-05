import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from '@/proxy';

const mockCreateServerClient = vi.fn();

vi.mock('@supabase/ssr', () => ({
  createServerClient: (...args: unknown[]) => mockCreateServerClient(...args),
}));

function createSupabaseClient({
  subject = 'user-1',
  error = null,
  throws = false,
}: {
  subject?: string | null;
  error?: unknown;
  throws?: boolean;
} = {}) {
  const getClaims = throws
    ? vi.fn().mockRejectedValue(new Error('malformed token'))
    : vi.fn().mockResolvedValue({
        data: subject === null ? null : { claims: { sub: subject } },
        error,
      });

  return {
    auth: {
      getClaims,
    },
  };
}

function createRequest(path: string) {
  return new NextRequest(`http://localhost${path}`);
}

describe('proxy auth protection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.KEEN_E2E_BYPASS_AUTH;
  });

  afterEach(() => {
    delete process.env.KEEN_E2E_BYPASS_AUTH;
  });

  it('allows public routes through without consulting Supabase', async () => {
    const response = await proxy(createRequest('/login'));

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
    expect(mockCreateServerClient).not.toHaveBeenCalled();
  });

  it('allows the app icon through without consulting Supabase', async () => {
    const response = await proxy(createRequest('/icon.png'));

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
    expect(mockCreateServerClient).not.toHaveBeenCalled();
  });

  it('redirects unauthenticated protected routes to login', async () => {
    mockCreateServerClient.mockReturnValue(
      createSupabaseClient({ subject: null })
    );

    const response = await proxy(createRequest('/home'));
    const location = response.headers.get('location');

    expect(response.status).toBe(307);
    expect(location).not.toBeNull();
    expect(new URL(location!).pathname).toBe('/login');
    expect(new URL(location!).searchParams.get('redirect')).toBe('/home');
  });

  it('redirects unauthenticated admin access through the normal login flow', async () => {
    mockCreateServerClient.mockReturnValue(
      createSupabaseClient({ subject: null })
    );

    const response = await proxy(createRequest('/admin?range=7d'));
    const location = response.headers.get('location');

    expect(response.status).toBe(307);
    expect(location).not.toBeNull();
    expect(new URL(location!).pathname).toBe('/login');
    expect(new URL(location!).searchParams.get('redirect')).toBe('/admin?range=7d');
  });

  it('preserves the original query string in the login redirect', async () => {
    mockCreateServerClient.mockReturnValue(
      createSupabaseClient({ subject: null })
    );

    const response = await proxy(createRequest('/settings?tab=account'));
    const location = response.headers.get('location');

    expect(response.status).toBe(307);
    expect(location).not.toBeNull();
    expect(new URL(location!).searchParams.get('redirect')).toBe('/settings?tab=account');
  });

  it('allows authenticated protected routes through', async () => {
    const supabase = createSupabaseClient();
    mockCreateServerClient.mockReturnValue(supabase);

    const response = await proxy(createRequest('/settings'));

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
    expect(mockCreateServerClient).toHaveBeenCalledTimes(1);
    expect(supabase.auth.getClaims).toHaveBeenCalledTimes(1);
  });

  it.each([
    {
      label: 'claims verification error',
      client: createSupabaseClient({
        subject: null,
        error: new Error('invalid session'),
      }),
    },
    {
      label: 'missing subject',
      client: createSupabaseClient({ subject: null }),
    },
    {
      label: 'empty subject',
      client: createSupabaseClient({ subject: '' }),
    },
    {
      label: 'thrown claims verification',
      client: createSupabaseClient({ throws: true }),
    },
  ])('redirects after $label', async ({ client }) => {
    mockCreateServerClient.mockReturnValue(client);

    const response = await proxy(createRequest('/settings'));

    expect(response.status).toBe(307);
    expect(new URL(response.headers.get('location')!).pathname).toBe('/login');
    expect(client.auth.getClaims).toHaveBeenCalledTimes(1);
  });

  it('returns refreshed cookies with an authenticated response', async () => {
    const supabase = createSupabaseClient();
    mockCreateServerClient.mockImplementation(
      (
        _url: string,
        _key: string,
        options: {
          cookies: {
            setAll: (
              cookies: Array<{
                name: string;
                value: string;
                options?: { httpOnly?: boolean };
              }>
            ) => void;
          };
        }
      ) => {
        options.cookies.setAll([
          {
            name: 'sb-session',
            value: 'refreshed',
            options: { httpOnly: true },
          },
        ]);
        return supabase;
      }
    );

    const response = await proxy(createRequest('/settings'));

    expect(response.status).toBe(200);
    expect(response.cookies.get('sb-session')?.value).toBe('refreshed');
  });

  it('preserves cleared session cookies on an auth redirect', async () => {
    const supabase = createSupabaseClient({ subject: null });
    mockCreateServerClient.mockImplementation(
      (
        _url: string,
        _key: string,
        options: {
          cookies: {
            setAll: (
              cookies: Array<{
                name: string;
                value: string;
                options?: { maxAge?: number };
              }>
            ) => void;
          };
        }
      ) => {
        options.cookies.setAll([
          {
            name: 'sb-session',
            value: '',
            options: { maxAge: 0 },
          },
        ]);
        return supabase;
      }
    );

    const response = await proxy(createRequest('/settings'));

    expect(response.status).toBe(307);
    expect(response.cookies.get('sb-session')?.value).toBe('');
  });

  it('bypasses auth only for /home e2e fixtures when enabled', async () => {
    process.env.KEEN_E2E_BYPASS_AUTH = '1';

    const response = await proxy(createRequest('/home?e2e=inline-threads'));

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
    expect(mockCreateServerClient).not.toHaveBeenCalled();
  });

  it('bypasses auth for routed /home e2e fixtures when enabled', async () => {
    process.env.KEEN_E2E_BYPASS_AUTH = '1';

    const response = await proxy(createRequest('/home/conversation-123?e2e=home-routing'));

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
    expect(mockCreateServerClient).not.toHaveBeenCalled();
  });

  it('bypasses auth for workspace e2e fixtures when enabled', async () => {
    process.env.KEEN_E2E_BYPASS_AUTH = '1';

    const response = await proxy(createRequest('/workspaces/workspace-1?e2e=workspace-view'));

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
    expect(mockCreateServerClient).not.toHaveBeenCalled();
  });

  it('does not bypass auth for other e2e routes', async () => {
    process.env.KEEN_E2E_BYPASS_AUTH = '1';
    mockCreateServerClient.mockReturnValue(
      createSupabaseClient({ subject: null })
    );

    const response = await proxy(createRequest('/settings?e2e=inline-threads'));
    const location = response.headers.get('location');

    expect(response.status).toBe(307);
    expect(location).not.toBeNull();
    expect(new URL(location!).searchParams.get('redirect')).toBe('/settings?e2e=inline-threads');
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCreateSupabaseServerClient = vi.hoisted(() => vi.fn());
const mockRevalidatePath = vi.hoisted(() => vi.fn());
const mockRedirect = vi.hoisted(() =>
  vi.fn((location: string) => {
    throw new Error(`NEXT_REDIRECT:${location}`);
  })
);

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: () => mockCreateSupabaseServerClient(),
}));
vi.mock('next/cache', () => ({
  revalidatePath: (path: string) => mockRevalidatePath(path),
}));
vi.mock('next/navigation', () => ({
  redirect: (location: string) => mockRedirect(location),
}));

import {
  saveGlobalInstructions,
  signOut,
} from '@/app/settings/actions';

function createActionClient({
  user = { id: 'verified-user' },
  authError = null,
  persistedValue = 'Persisted instructions',
  updateError = null,
  updateData,
  signOutError = null,
}: {
  user?: { id: string } | null;
  authError?: unknown;
  persistedValue?: string;
  updateError?: unknown;
  updateData?: { global_instructions: unknown } | null;
  signOutError?: unknown;
} = {}) {
  const single = vi.fn().mockResolvedValue({
    data:
      updateData === undefined
        ? { global_instructions: persistedValue }
        : updateData,
    error: updateError,
  });
  const select = vi.fn(() => ({ single }));
  const eq = vi.fn(() => ({ select }));
  const update = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ update }));
  const getUser = vi.fn().mockResolvedValue({
    data: { user },
    error: authError,
  });
  const authSignOut = vi.fn().mockResolvedValue({ error: signOutError });

  return {
    client: {
      auth: {
        getUser,
        signOut: authSignOut,
      },
      from,
    },
    spies: {
      getUser,
      authSignOut,
      from,
      update,
      eq,
      select,
      single,
    },
  };
}

describe('settings server actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('authorizes the save, scopes it to the verified user, and returns sanitized data', async () => {
    const { client, spies } = createActionClient({
      persistedValue: '  Persisted instructions\r\n  ',
    });
    mockCreateSupabaseServerClient.mockResolvedValue(client);

    await expect(
      saveGlobalInstructions('  Draft instructions\r\n  ')
    ).resolves.toEqual({
      status: 'saved',
      value: 'Persisted instructions',
    });

    expect(spies.getUser).toHaveBeenCalledTimes(1);
    expect(spies.from).toHaveBeenCalledWith('profiles');
    expect(spies.update).toHaveBeenCalledWith({
      global_instructions: 'Draft instructions',
    });
    expect(spies.eq).toHaveBeenCalledWith('id', 'verified-user');
    expect(spies.select).toHaveBeenCalledWith('global_instructions');
    expect(spies.single).toHaveBeenCalledTimes(1);
    expect(mockRevalidatePath).toHaveBeenCalledWith('/settings');
  });

  it.each([
    {
      label: 'missing user',
      options: { user: null },
    },
    {
      label: 'authentication error',
      options: {
        user: { id: 'verified-user' },
        authError: new Error('invalid session'),
      },
    },
  ])('redirects on $label without attempting an update', async ({ options }) => {
    const { client, spies } = createActionClient(options);
    mockCreateSupabaseServerClient.mockResolvedValue(client);

    await expect(saveGlobalInstructions('Draft')).rejects.toThrow(
      'NEXT_REDIRECT:/login?redirect=%2Fsettings'
    );
    expect(mockRedirect).toHaveBeenCalledWith(
      '/login?redirect=%2Fsettings'
    );
    expect(spies.from).not.toHaveBeenCalled();
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: 'profile update error',
      options: {
        updateError: new Error('write failed'),
        updateData: null,
      },
    },
    {
      label: 'missing updated profile',
      options: { updateData: null },
    },
  ])('reports an error for $label and does not revalidate', async ({ options }) => {
    const { client } = createActionClient(options);
    mockCreateSupabaseServerClient.mockResolvedValue(client);

    await expect(saveGlobalInstructions('Keep this draft')).resolves.toEqual({
      status: 'error',
    });
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it('redirects after a successful server-side sign-out', async () => {
    const { client, spies } = createActionClient();
    mockCreateSupabaseServerClient.mockResolvedValue(client);

    await expect(signOut()).rejects.toThrow('NEXT_REDIRECT:/login');
    expect(spies.authSignOut).toHaveBeenCalledTimes(1);
    expect(mockRedirect).toHaveBeenCalledWith('/login');
  });

  it('returns an error without redirecting when sign-out fails', async () => {
    const { client, spies } = createActionClient({
      signOutError: new Error('logout failed'),
    });
    mockCreateSupabaseServerClient.mockResolvedValue(client);

    await expect(signOut()).resolves.toEqual({ status: 'error' });
    expect(spies.authSignOut).toHaveBeenCalledTimes(1);
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});

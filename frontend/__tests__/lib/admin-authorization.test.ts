import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockCreateSupabaseServerClient = vi.hoisted(() => vi.fn());

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: () => mockCreateSupabaseServerClient(),
}));

import {
  authorizeAdminUser,
  isAdminAuthorization,
  parseAdminUserIds,
} from '@/lib/admin/authorization';

const adminId = '11111111-1111-4111-8111-111111111111';
const otherId = '22222222-2222-4222-8222-222222222222';

function authenticatedClient(userId: string | null, error: unknown = null) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: userId ? { id: userId } : null },
        error,
      }),
    },
  };
}

describe('admin authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.ORCHARD_ADMIN_USER_IDS;
  });

  afterEach(() => {
    delete process.env.ORCHARD_ADMIN_USER_IDS;
  });

  it('normalizes surrounding whitespace and deduplicates valid UUIDs', () => {
    expect(parseAdminUserIds(` ${adminId},\n${otherId}, ${adminId} `)).toEqual(
      new Set([adminId, otherId])
    );
  });

  it.each([
    undefined,
    '',
    '   ',
    `${adminId},`,
    `${adminId},not-a-uuid`,
  ])('fails closed for a missing, empty, or malformed allowlist: %s', (value) => {
    expect(parseAdminUserIds(value)).toBeNull();
  });

  it('authenticates before evaluating the allowlist and returns branded access', async () => {
    const client = authenticatedClient(adminId.toUpperCase());
    mockCreateSupabaseServerClient.mockResolvedValue(client);
    process.env.ORCHARD_ADMIN_USER_IDS = ` ${otherId}, ${adminId} `;

    const authorization = await authorizeAdminUser();

    expect(client.auth.getUser).toHaveBeenCalledTimes(1);
    expect(authorization).toMatchObject({ userId: adminId });
    expect(isAdminAuthorization(authorization)).toBe(true);
  });

  it('denies signed-out, authentication-error, and non-admin users', async () => {
    process.env.ORCHARD_ADMIN_USER_IDS = adminId;

    for (const client of [
      authenticatedClient(null),
      authenticatedClient(adminId, { message: 'invalid session' }),
      authenticatedClient(otherId),
    ]) {
      mockCreateSupabaseServerClient.mockResolvedValueOnce(client);
      await expect(authorizeAdminUser()).resolves.toBeNull();
    }
  });

  it('does not grant access when any allowlist entry is malformed', async () => {
    const client = authenticatedClient(adminId);
    mockCreateSupabaseServerClient.mockResolvedValue(client);
    process.env.ORCHARD_ADMIN_USER_IDS = `${adminId},invalid`;

    await expect(authorizeAdminUser()).resolves.toBeNull();
    expect(client.auth.getUser).toHaveBeenCalledTimes(1);
  });
});

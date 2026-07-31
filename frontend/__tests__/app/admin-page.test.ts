import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockAuthorizeAdminUser = vi.hoisted(() => vi.fn());
const mockNotFound = vi.hoisted(() => vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND');
}));

vi.mock('@/lib/admin/authorization', () => ({
  authorizeAdminUser: () => mockAuthorizeAdminUser(),
}));
vi.mock('next/navigation', () => ({
  notFound: () => mockNotFound(),
}));

import AdminPage from '@/app/admin/page';

describe('admin page authorization boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns not found for a signed-in non-admin', async () => {
    mockAuthorizeAdminUser.mockResolvedValue(null);

    await expect(AdminPage()).rejects.toThrow('NEXT_NOT_FOUND');
    expect(mockNotFound).toHaveBeenCalledTimes(1);
  });

  it('renders only after admin authorization succeeds', async () => {
    mockAuthorizeAdminUser.mockResolvedValue({
      userId: '11111111-1111-4111-8111-111111111111',
    });

    const result = await AdminPage();

    expect(mockAuthorizeAdminUser).toHaveBeenCalledTimes(1);
    expect(mockNotFound).not.toHaveBeenCalled();
    expect(result.type).toBe('main');
  });
});

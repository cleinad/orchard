import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockAuthorizeAdminUser = vi.hoisted(() => vi.fn());
const mockLoadAdminUsageDashboard = vi.hoisted(() => vi.fn());
const mockNoStore = vi.hoisted(() => vi.fn());
const mockNotFound = vi.hoisted(() => vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND');
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/admin/authorization', () => ({
  authorizeAdminUser: () => mockAuthorizeAdminUser(),
}));
vi.mock('@/lib/admin/usage', () => ({
  loadAdminUsageDashboard: (...args: unknown[]) =>
    mockLoadAdminUsageDashboard(...args),
}));
vi.mock('next/cache', () => ({
  unstable_noStore: () => mockNoStore(),
}));
vi.mock('next/navigation', () => ({
  notFound: () => mockNotFound(),
}));

import {
  AdminDashboard,
  AdminDashboardError,
} from '@/app/admin/AdminDashboard';
import AdminPage from '@/app/admin/page';

describe('admin page authorization boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns not found for a signed-in non-admin', async () => {
    mockAuthorizeAdminUser.mockResolvedValue(null);

    await expect(AdminPage()).rejects.toThrow('NEXT_NOT_FOUND');
    expect(mockNotFound).toHaveBeenCalledTimes(1);
    expect(mockLoadAdminUsageDashboard).not.toHaveBeenCalled();
  });

  it('loads aggregate data only after admin authorization succeeds', async () => {
    const authorization = {
      userId: '11111111-1111-4111-8111-111111111111',
    };
    const dashboard = { query: { preset: '7d' } };
    mockAuthorizeAdminUser.mockResolvedValue(authorization);
    mockLoadAdminUsageDashboard.mockResolvedValue(dashboard);

    const searchParams = Promise.resolve({ range: '7d', page: '2' });
    const result = await AdminPage({ searchParams });

    expect(mockNoStore).toHaveBeenCalledTimes(1);
    expect(mockAuthorizeAdminUser).toHaveBeenCalledTimes(1);
    expect(mockNotFound).not.toHaveBeenCalled();
    expect(mockLoadAdminUsageDashboard).toHaveBeenCalledWith(
      authorization,
      { range: '7d', page: '2' },
      expect.any(Date)
    );
    expect(result.type).toBe(AdminDashboard);
    expect(result.props.dashboard).toBe(dashboard);
  });

  it('renders a safe recovery state when aggregate queries fail', async () => {
    mockAuthorizeAdminUser.mockResolvedValue({
      userId: '11111111-1111-4111-8111-111111111111',
    });
    mockLoadAdminUsageDashboard.mockRejectedValue(
      new Error('private database detail')
    );

    const result = await AdminPage();

    expect(result.type).toBe(AdminDashboardError);
    expect(result.props).toEqual({ retryHref: '/admin' });
  });
});

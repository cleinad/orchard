import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockRpc = vi.hoisted(() => vi.fn());
const mockCreateClient = vi.hoisted(() => vi.fn((
  url: string,
  key: string,
  options: unknown
) => {
  void url;
  void key;
  void options;
  return { rpc: mockRpc };
}));
const mockCreateSupabaseServerClient = vi.hoisted(() => vi.fn());

vi.mock('server-only', () => ({}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: (url: string, key: string, options: unknown) =>
    mockCreateClient(url, key, options),
}));
vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: () => mockCreateSupabaseServerClient(),
}));

import {
  authorizeAdminUser,
  type AdminAuthorization,
} from '@/lib/admin/authorization';
import {
  loadAdminUsageDashboard,
  parseAdminUsageQuery,
} from '@/lib/admin/usage';

const adminId = '11111111-1111-4111-8111-111111111111';
const zeroUsageId = '22222222-2222-4222-8222-222222222222';
const now = new Date('2026-07-31T15:30:00.000Z');

const rpcData: Record<string, unknown> = {
  admin_model_usage_overview: [{
    registered_users: '2',
    active_users: '1',
    responses: '1',
    provider_calls: '3',
    input_tokens: '100',
    cache_read_tokens: '20',
    output_tokens: '40',
    reasoning_tokens: '10',
    total_tokens: '140',
    estimated_cost_nanousd: '750',
    estimated_chat_cost_nanousd: '500',
    average_chat_cost_nanousd: '500.4',
    completed_calls: '3',
    usage_reported_calls: '2',
    billable_usage_calls: '2',
    priced_calls: '1',
    missing_usage_calls: '1',
    missing_price_calls: '1',
  }],
  admin_model_usage_daily: [{
    usage_day: '2026-07-31',
    responses: '1',
    provider_calls: '3',
    total_tokens: '140',
    estimated_cost_nanousd: '750',
    missing_usage_calls: '1',
    missing_price_calls: '1',
  }],
  admin_model_usage_models: [{
    model_key: 'gpt-5.4',
    resolved_model_id: 'gpt-5.4',
    provider: 'openai',
    provider_model_id: 'gpt-5.4',
    primary_responses: '1',
    auxiliary_calls: '2',
    distinct_users: '1',
    auto_requested_responses: '1',
    input_tokens: '100',
    cache_read_tokens: '20',
    output_tokens: '40',
    reasoning_tokens: '10',
    total_tokens: '140',
    estimated_cost_nanousd: '750',
    failed_calls: '0',
    billable_usage_calls: '2',
    priced_calls: '1',
  }],
  admin_model_usage_users: [
    {
      total_users: '2',
      user_id: adminId,
      email: 'admin@example.com',
      joined_at: '2026-07-01T00:00:00.000Z',
      last_active_at: '2026-07-31T12:00:00.000Z',
      responses: '1',
      provider_calls: '3',
      input_tokens: '100',
      cache_read_tokens: '20',
      output_tokens: '40',
      reasoning_tokens: '10',
      total_tokens: '140',
      estimated_cost_nanousd: '750',
      average_chat_cost_nanousd: '500.6',
      most_requested_model_id: 'auto',
      most_resolved_model_id: 'gpt-5.4',
      completed_calls: '3',
      usage_reported_calls: '2',
      billable_usage_calls: '2',
      priced_calls: '1',
      missing_price_calls: '1',
    },
    {
      total_users: '2',
      user_id: zeroUsageId,
      email: 'new@example.com',
      joined_at: '2026-07-30T00:00:00.000Z',
      last_active_at: null,
      responses: '0',
      provider_calls: '0',
      input_tokens: null,
      cache_read_tokens: null,
      output_tokens: null,
      reasoning_tokens: null,
      total_tokens: null,
      estimated_cost_nanousd: null,
      average_chat_cost_nanousd: null,
      most_requested_model_id: null,
      most_resolved_model_id: null,
      completed_calls: '0',
      usage_reported_calls: '0',
      billable_usage_calls: '0',
      priced_calls: '0',
      missing_price_calls: '0',
    },
  ],
};

async function authorization() {
  mockCreateSupabaseServerClient.mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: adminId } },
        error: null,
      }),
    },
  });
  const access = await authorizeAdminUser();
  if (!access) throw new Error('test authorization failed');
  return access;
}

describe('admin usage query service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ORCHARD_ADMIN_USER_IDS = adminId;
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
    mockRpc.mockImplementation((name: string) => Promise.resolve({
      data: rpcData[name],
      error: null,
    }));
  });

  afterEach(() => {
    delete process.env.ORCHARD_ADMIN_USER_IDS;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  it('rejects unbranded input before constructing the elevated client', async () => {
    await expect(loadAdminUsageDashboard(
      { userId: adminId } as AdminAuthorization,
      {},
      now
    )).rejects.toThrow('admin_authorization_required');
    expect(mockCreateClient).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('validates URL inputs and creates deterministic half-open UTC intervals', () => {
    expect(parseAdminUsageQuery({
      range: '7d',
      sort: 'responses',
      direction: 'asc',
      page: '2',
      pageSize: '50',
    }, now)).toEqual({
      preset: '7d',
      sort: 'responses',
      direction: 'asc',
      page: 2,
      pageSize: 50,
      filtersNormalized: false,
      start: '2026-07-25T00:00:00.000Z',
      end: '2026-08-01T00:00:00.000Z',
    });

    expect(parseAdminUsageQuery({
      range: 'invalid',
      sort: 'drop table',
      direction: 'sideways',
      page: '-1',
      pageSize: '1000',
    }, now)).toMatchObject({
      preset: '30d',
      sort: 'estimated_cost',
      direction: 'desc',
      page: 1,
      pageSize: 25,
      filtersNormalized: true,
      start: '2026-07-02T00:00:00.000Z',
      end: '2026-08-01T00:00:00.000Z',
    });
    expect(parseAdminUsageQuery({ range: 'all' }, now).start)
      .toBe('1970-01-01T00:00:00.000Z');
  });

  it('returns typed aggregate view models while preserving zero and unknown values', async () => {
    const dashboard = await loadAdminUsageDashboard(
      await authorization(),
      {
        range: '7d',
        sort: 'responses',
        direction: 'asc',
        page: '2',
        pageSize: '50',
      },
      now
    );

    expect(mockCreateClient).toHaveBeenCalledWith(
      'http://127.0.0.1:54321',
      'test-service-role-key',
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      }
    );
    expect(mockRpc).toHaveBeenCalledWith('admin_model_usage_users', {
      p_start: '2026-07-25T00:00:00.000Z',
      p_end: '2026-08-01T00:00:00.000Z',
      p_sort: 'responses',
      p_direction: 'asc',
      p_limit: 50,
      p_offset: 50,
    });
    expect(dashboard.overview).toMatchObject({
      registeredUsers: BigInt(2),
      responses: BigInt(1),
      providerCalls: BigInt(3),
      estimatedCostNanousd: BigInt(750),
      estimatedChatCostNanousd: BigInt(500),
      averageChatCostNanousd: BigInt(500),
      coverage: {
        completedCalls: BigInt(3),
        usageReportedCalls: BigInt(2),
        billableUsageCalls: BigInt(2),
        pricedCalls: BigInt(1),
        missingUsageCalls: BigInt(1),
        missingPriceCalls: BigInt(1),
      },
    });
    expect(dashboard.models[0]).toMatchObject({
      primaryResponses: BigInt(1),
      auxiliaryCalls: BigInt(2),
      autoRequestedResponses: BigInt(1),
      estimatedCostNanousd: BigInt(750),
    });
    expect(dashboard.users.totalUsers).toBe(BigInt(2));
    expect(dashboard.users.items[0]).toMatchObject({
      id: adminId,
      averageChatCostNanousd: BigInt(501),
      mostRequestedModelId: 'auto',
      mostResolvedModelId: 'gpt-5.4',
    });
    expect(dashboard.users.items[1]).toMatchObject({
      id: zeroUsageId,
      responses: BigInt(0),
      providerCalls: BigInt(0),
      tokens: {
        input: null,
        cacheRead: null,
        output: null,
        reasoning: null,
        total: null,
      },
      estimatedCostNanousd: null,
      averageChatCostNanousd: null,
      lastActiveAt: null,
    });
  });

  it('returns a fixed error without exposing database details', async () => {
    mockRpc.mockImplementation((name: string) => Promise.resolve({
      data: null,
      error: { message: `${name}: private database detail` },
    }));

    await expect(loadAdminUsageDashboard(await authorization(), {}, now))
      .rejects.toThrow(/^admin_usage_admin_model_usage_/);
  });
});

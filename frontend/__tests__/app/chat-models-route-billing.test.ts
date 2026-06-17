import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockSupabase } from '../helpers/mock-supabase';

const mockCreateSupabaseServerClient = vi.fn();

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: () => mockCreateSupabaseServerClient(),
}));

function createRouteSupabase({
  authenticated = true,
  entitlementRows = [],
}: {
  authenticated?: boolean;
  entitlementRows?: object[];
} = {}) {
  const { client } = createMockSupabase({
    tables: {
      billing_entitlements: { rows: entitlementRows },
    },
  });

  return {
    ...client,
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: authenticated ? { id: 'user-1' } : null },
        error: null,
      }),
    },
  };
}

describe('chat model route billing projection', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv('OPENAI_API_KEY', 'test-openai-key');
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-anthropic-key');
    vi.stubEnv('GOOGLE_GENERATIVE_AI_API_KEY', 'test-google-key');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('rejects unauthenticated requests', async () => {
    mockCreateSupabaseServerClient.mockResolvedValue(
      createRouteSupabase({ authenticated: false })
    );

    const { GET } = await import('@/app/api/chat/models/route');
    const response = await GET();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
  });

  it('labels paid models but keeps them unavailable for free users', async () => {
    mockCreateSupabaseServerClient.mockResolvedValue(createRouteSupabase());

    const { GET } = await import('@/app/api/chat/models/route');
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.entitlement).toMatchObject({
      planKey: 'free',
      canUseCloudModels: false,
      monthlyLimit: 20,
    });
    expect(body.models.find((model: { id: string }) => model.id === 'gpt-5.4')).toMatchObject({
      available: false,
      requiresPaidPlan: true,
      unavailableReason: 'Upgrade to use',
    });
    expect(
      body.models.find((model: { id: string }) => model.id === 'gemini-3-flash-preview')
    ).toMatchObject({
      available: true,
      requiresPaidPlan: false,
    });
  });

  it('makes configured paid models available for paid projected entitlements', async () => {
    mockCreateSupabaseServerClient.mockResolvedValue(
      createRouteSupabase({
        entitlementRows: [
          {
            plan_key: 'keen_monthly',
            can_use_cloud_models: true,
            monthly_limit: 1000,
            status: 'active',
            subscription_id: 'sub_123',
            current_period_start: '2099-06-01T00:00:00.000Z',
            current_period_end: '2099-07-01T00:00:00.000Z',
            display_state: 'active',
            refreshed_at: '2099-06-12T00:00:00.000Z',
          },
        ],
      })
    );

    const { GET } = await import('@/app/api/chat/models/route');
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.entitlement).toMatchObject({
      planKey: 'keen_monthly',
      canUseCloudModels: true,
      monthlyLimit: 1000,
    });
    expect(body.models.find((model: { id: string }) => model.id === 'gpt-5.4')).toMatchObject({
      available: true,
      requiresPaidPlan: true,
      unavailableReason: null,
    });
  });
});

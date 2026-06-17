import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockSupabase } from '../helpers/mock-supabase';

const mockCreateSupabaseServerClient = vi.fn();
const mockCreateSupabaseServiceRoleClient = vi.fn();
const mockPortalSessionCreate = vi.fn();
const mockCheckoutSessionCreate = vi.fn();
const mockCheckoutSessionList = vi.fn();
const mockCustomerCreate = vi.fn();
const mockSubscriptionsList = vi.fn();

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: () => mockCreateSupabaseServerClient(),
  createSupabaseServiceRoleClient: () => mockCreateSupabaseServiceRoleClient(),
}));

vi.mock('@/lib/stripe', () => ({
  getAppUrl: () => 'http://localhost:3000',
  getStripe: () => ({
    billingPortal: {
      sessions: {
        create: (...args: unknown[]) => mockPortalSessionCreate(...args),
      },
    },
    checkout: {
      sessions: {
        create: (...args: unknown[]) => mockCheckoutSessionCreate(...args),
        list: (...args: unknown[]) => mockCheckoutSessionList(...args),
      },
    },
    customers: {
      create: (...args: unknown[]) => mockCustomerCreate(...args),
    },
    subscriptions: {
      list: (...args: unknown[]) => mockSubscriptionsList(...args),
    },
  }),
}));

function createRouteSupabase(authenticated = true, tables = {}) {
  const { client } = createMockSupabase({ tables });
  return {
    ...client,
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: {
          user: authenticated
            ? { id: 'user-1', email: 'user@example.com' }
            : null,
        },
        error: null,
      }),
    },
  };
}

describe('billing route auth', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv('STRIPE_PRICE_MONTHLY_ID', 'price_monthly');
    mockPortalSessionCreate.mockResolvedValue({ url: 'https://billing.stripe.test/session' });
    mockCheckoutSessionCreate.mockResolvedValue({ url: 'https://checkout.stripe.test/session' });
    mockCheckoutSessionList.mockResolvedValue({ data: [] });
    mockCustomerCreate.mockResolvedValue({ id: 'cus_123' });
    mockSubscriptionsList.mockResolvedValue({ data: [] });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('rejects unauthenticated checkout requests', async () => {
    mockCreateSupabaseServerClient.mockResolvedValue(createRouteSupabase(false));

    const { POST } = await import('@/app/api/billing/checkout/route');
    const response = await POST();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
  });

  it('rejects unauthenticated portal requests', async () => {
    mockCreateSupabaseServerClient.mockResolvedValue(createRouteSupabase(false));

    const { POST } = await import('@/app/api/billing/portal/route');
    const response = await POST();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
  });

  it('does not open the portal without a mapped Stripe customer', async () => {
    mockCreateSupabaseServerClient.mockResolvedValue(createRouteSupabase(true));

    const { POST } = await import('@/app/api/billing/portal/route');
    const response = await POST();

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'No billing customer found' });
  });

  it('creates an authenticated checkout session for free users', async () => {
    const serverSupabase = createRouteSupabase(true, {
      billing_entitlements: { rows: [] },
    });
    const serviceRoleSupabase = createRouteSupabase(true, {
      billing_customers: { rows: [] },
    });
    mockCreateSupabaseServerClient.mockResolvedValue(serverSupabase);
    mockCreateSupabaseServiceRoleClient.mockReturnValue(serviceRoleSupabase);

    const { POST } = await import('@/app/api/billing/checkout/route');
    const response = await POST();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      url: 'https://checkout.stripe.test/session',
    });
    expect(mockCustomerCreate).toHaveBeenCalledWith(
      {
        email: 'user@example.com',
        metadata: { user_id: 'user-1' },
      },
      { idempotencyKey: 'customer:user-1' }
    );
    expect(mockCheckoutSessionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'subscription',
        customer: 'cus_123',
        client_reference_id: 'user-1',
        line_items: [{ price: 'price_monthly', quantity: 1 }],
        success_url:
          'http://localhost:3000/settings/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}',
        cancel_url: 'http://localhost:3000/settings/billing?checkout=canceled',
        metadata: {
          user_id: 'user-1',
          price_id: 'price_monthly',
        },
        subscription_data: {
          metadata: {
            user_id: 'user-1',
            price_id: 'price_monthly',
          },
        },
      }),
      expect.objectContaining({
        idempotencyKey: expect.stringMatching(/^checkout:user-1:price_monthly:\d+$/),
      })
    );
  });

  it('reuses existing Stripe customers when creating checkout sessions', async () => {
    const serverSupabase = createRouteSupabase(true, {
      billing_entitlements: { rows: [] },
    });
    const serviceRoleSupabase = createRouteSupabase(true, {
      billing_customers: { rows: [{ stripe_customer_id: 'cus_existing' }] },
    });
    mockCreateSupabaseServerClient.mockResolvedValue(serverSupabase);
    mockCreateSupabaseServiceRoleClient.mockReturnValue(serviceRoleSupabase);

    const { POST } = await import('@/app/api/billing/checkout/route');
    const response = await POST();

    expect(response.status).toBe(200);
    expect(mockCustomerCreate).not.toHaveBeenCalled();
    expect(mockSubscriptionsList).toHaveBeenCalledWith({
      customer: 'cus_existing',
      status: 'all',
      limit: 10,
    });
    expect(mockCheckoutSessionList).toHaveBeenCalledWith({
      customer: 'cus_existing',
      status: 'open',
      limit: 10,
    });
    expect(mockCheckoutSessionCreate).toHaveBeenCalledWith(
      expect.objectContaining({ customer: 'cus_existing' }),
      expect.anything()
    );
  });

  it('reuses an existing open checkout session for the user', async () => {
    const serverSupabase = createRouteSupabase(true, {
      billing_entitlements: { rows: [] },
    });
    const serviceRoleSupabase = createRouteSupabase(true, {
      billing_customers: { rows: [{ stripe_customer_id: 'cus_existing' }] },
    });
    mockCreateSupabaseServerClient.mockResolvedValue(serverSupabase);
    mockCreateSupabaseServiceRoleClient.mockReturnValue(serviceRoleSupabase);
    mockCheckoutSessionList.mockResolvedValue({
      data: [
        {
          mode: 'subscription',
          url: 'https://checkout.stripe.test/open-session',
          client_reference_id: 'user-1',
          metadata: { user_id: 'user-1' },
        },
      ],
    });

    const { POST } = await import('@/app/api/billing/checkout/route');
    const response = await POST();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      url: 'https://checkout.stripe.test/open-session',
    });
    expect(mockCheckoutSessionCreate).not.toHaveBeenCalled();
  });

  it.each(['active', 'trialing', 'past_due', 'unpaid', 'incomplete'])(
    'refuses checkout when Stripe already has a %s monthly subscription',
    async (status) => {
    const serverSupabase = createRouteSupabase(true, {
      billing_entitlements: { rows: [] },
    });
    const serviceRoleSupabase = createRouteSupabase(true, {
      billing_customers: { rows: [{ stripe_customer_id: 'cus_existing' }] },
    });
    mockCreateSupabaseServerClient.mockResolvedValue(serverSupabase);
    mockCreateSupabaseServiceRoleClient.mockReturnValue(serviceRoleSupabase);
    mockSubscriptionsList.mockResolvedValue({
      data: [
        {
          status,
          items: { data: [{ price: { id: 'price_monthly' } }] },
        },
      ],
    });

    const { POST } = await import('@/app/api/billing/checkout/route');
    const response = await POST();

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: 'Subscription already exists. Open billing to manage it.',
    });
    expect(mockCheckoutSessionCreate).not.toHaveBeenCalled();
    }
  );

  it('refuses checkout when the local entitlement projection is already paid', async () => {
    const serverSupabase = createRouteSupabase(true, {
      billing_entitlements: {
        rows: [
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
      },
    });
    mockCreateSupabaseServerClient.mockResolvedValue(serverSupabase);

    const { POST } = await import('@/app/api/billing/checkout/route');
    const response = await POST();

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'Subscription is already active' });
    expect(mockCreateSupabaseServiceRoleClient).not.toHaveBeenCalled();
    expect(mockCustomerCreate).not.toHaveBeenCalled();
    expect(mockSubscriptionsList).not.toHaveBeenCalled();
    expect(mockCheckoutSessionCreate).not.toHaveBeenCalled();
  });

  it('creates an authenticated customer portal session for mapped customers', async () => {
    mockCreateSupabaseServerClient.mockResolvedValue(
      createRouteSupabase(true, {
        billing_customers: {
          rows: [{ stripe_customer_id: 'cus_123' }],
        },
      })
    );

    const { POST } = await import('@/app/api/billing/portal/route');
    const response = await POST();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      url: 'https://billing.stripe.test/session',
    });
    expect(mockPortalSessionCreate).toHaveBeenCalledWith({
      customer: 'cus_123',
      return_url: 'http://localhost:3000/settings/billing',
    });
  });
});

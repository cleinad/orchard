import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockSupabase } from '../helpers/mock-supabase';

const mockCreateSupabaseServerClient = vi.fn();
const mockCreateSupabaseServiceRoleClient = vi.fn();

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: () => mockCreateSupabaseServerClient(),
  createSupabaseServiceRoleClient: () => mockCreateSupabaseServiceRoleClient(),
}));

vi.mock('@/lib/stripe', () => ({
  getStripe: () => ({
    checkout: { sessions: { retrieve: vi.fn() } },
    subscriptions: { retrieve: vi.fn() },
  }),
}));

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));

function createBillingPageSupabase({
  authenticated = true,
  entitlementRows = [],
  usageRows = [],
  customerRows = [],
}: {
  authenticated?: boolean;
  entitlementRows?: object[];
  usageRows?: object[];
  customerRows?: object[];
} = {}) {
  const { client } = createMockSupabase({
    tables: {
      billing_entitlements: { rows: entitlementRows },
      usage_counters: { rows: usageRows },
      billing_customers: { rows: customerRows },
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

function entitlementRow({
  planKey = 'free',
  canUseCloudModels = false,
  monthlyLimit = 20,
  status = 'none',
  displayState = 'no_subscription',
  subscriptionId = null,
  currentPeriodStart = null,
  currentPeriodEnd = null,
}: {
  planKey?: string;
  canUseCloudModels?: boolean;
  monthlyLimit?: number;
  status?: string;
  displayState?: string;
  subscriptionId?: string | null;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
}) {
  return {
    plan_key: planKey,
    can_use_cloud_models: canUseCloudModels,
    monthly_limit: monthlyLimit,
    status,
    subscription_id: subscriptionId,
    current_period_start: currentPeriodStart,
    current_period_end: currentPeriodEnd,
    display_state: displayState,
    refreshed_at: '2099-06-12T00:00:00.000Z',
  };
}

describe('settings billing page', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('renders free plan, usage, upgrade, and syncing checkout state', async () => {
    mockCreateSupabaseServerClient.mockResolvedValue(
      createBillingPageSupabase({
        usageRows: [{ count: 7 }],
      })
    );

    const { default: BillingPage } = await import('@/app/settings/billing/page');
    const element = await BillingPage({
      searchParams: Promise.resolve({ checkout: 'success' }),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('Checkout succeeded. Syncing subscription status.');
    expect(html).toContain('Current plan');
    expect(html).toContain('Free');
    expect(html).toContain('Monthly usage');
    expect(html).toContain('7 / 20');
    expect(html).toContain('Upgrade');
    expect(html).not.toContain('Manage billing');
  });

  it('renders paid plan state and manage billing action for mapped customers', async () => {
    mockCreateSupabaseServerClient.mockResolvedValue(
      createBillingPageSupabase({
        entitlementRows: [
          entitlementRow({
            planKey: 'keen_monthly',
            canUseCloudModels: true,
            monthlyLimit: 1000,
            status: 'active',
            subscriptionId: 'sub_123',
            currentPeriodStart: '2099-06-01T00:00:00.000Z',
            currentPeriodEnd: '2099-07-01T00:00:00.000Z',
            displayState: 'active',
          }),
        ],
        usageRows: [{ count: 42 }],
        customerRows: [{ stripe_customer_id: 'cus_123' }],
      })
    );

    const { default: BillingPage } = await import('@/app/settings/billing/page');
    const element = await BillingPage({ searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('Monthly plan');
    expect(html).toContain('Active');
    expect(html).toContain('42 / 1000');
    expect(html).toContain('Manage billing');
    expect(html).not.toContain('Upgrade');
  });

  it('renders canceling subscriptions as paid access until period end', async () => {
    mockCreateSupabaseServerClient.mockResolvedValue(
      createBillingPageSupabase({
        entitlementRows: [
          entitlementRow({
            planKey: 'keen_monthly',
            canUseCloudModels: true,
            monthlyLimit: 1000,
            status: 'active',
            subscriptionId: 'sub_123',
            currentPeriodStart: '2099-06-01T00:00:00.000Z',
            currentPeriodEnd: '2099-07-01T00:00:00.000Z',
            displayState: 'canceling_at_period_end',
          }),
        ],
        usageRows: [{ count: 12 }],
        customerRows: [{ stripe_customer_id: 'cus_123' }],
      })
    );

    const { default: BillingPage } = await import('@/app/settings/billing/page');
    const element = await BillingPage({ searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('Monthly plan');
    expect(html).toContain('Canceling at period end');
    expect(html).toContain('12 / 1000');
    expect(html).toContain('Manage billing');
  });

  it.each([
    ['canceled subscriptions', 'canceled', 'canceled', 'Canceled'],
    ['failed payments', 'past_due', 'payment_failed', 'Payment failed'],
  ])('renders %s as free access', async (_label, status, displayState, stateLabel) => {
    mockCreateSupabaseServerClient.mockResolvedValue(
      createBillingPageSupabase({
        entitlementRows: [
          entitlementRow({
            planKey: 'free',
            canUseCloudModels: false,
            monthlyLimit: 20,
            status,
            subscriptionId: 'sub_123',
            currentPeriodStart: '2099-06-01T00:00:00.000Z',
            currentPeriodEnd: '2099-07-01T00:00:00.000Z',
            displayState,
          }),
        ],
        usageRows: [{ count: 20 }],
        customerRows: [{ stripe_customer_id: 'cus_123' }],
      })
    );

    const { default: BillingPage } = await import('@/app/settings/billing/page');
    const element = await BillingPage({ searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('Free');
    expect(html).toContain(stateLabel);
    expect(html).toContain('20 / 20');
    expect(html).toContain('Upgrade');
    expect(html).toContain('Manage billing');
  });

  it('renders checkout canceled return state without changing the free plan', async () => {
    mockCreateSupabaseServerClient.mockResolvedValue(createBillingPageSupabase());

    const { default: BillingPage } = await import('@/app/settings/billing/page');
    const element = await BillingPage({
      searchParams: Promise.resolve({ checkout: 'canceled' }),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('Checkout was canceled. Your plan has not changed.');
    expect(html).toContain('Free');
    expect(html).toContain('No subscription');
  });
});

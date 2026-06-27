import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  markWebhookEventProcessing,
  processStripeEvent,
  refreshBillingEntitlement,
  syncBillingCustomerFromStripe,
  syncCheckoutSessionBilling,
} from '@/lib/stripe-billing';
import {
  createCheckoutSessionCompletedEventFixture,
  createEventFixture,
  createInvoicePaymentEventFixture,
  createSubscriptionFixture,
  unixSeconds,
} from '../fixtures/stripe-events';
import { createInMemoryBillingSupabase } from '../helpers/in-memory-billing-supabase';

function fakeSupabaseInsert(error: { code?: string; message: string } | null) {
  return {
    from: () => ({
      insert: () => Promise.resolve({ error }),
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({
            data: { processing_status: 'processed' },
            error: null,
          }),
        }),
      }),
    }),
  };
}

function fakeFailedDuplicateSupabase() {
  return {
    from: () => ({
      insert: () => Promise.resolve({
        error: { code: '23505', message: 'duplicate' },
      }),
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({
            data: { processing_status: 'failed' },
            error: null,
          }),
        }),
      }),
      update: () => ({
        eq: () => Promise.resolve({ error: null }),
      }),
    }),
  };
}

describe('stripe webhook idempotency', () => {
  it('marks first delivery for processing', async () => {
    await expect(
      markWebhookEventProcessing(fakeSupabaseInsert(null) as never, {
        id: 'evt_123',
        type: 'customer.subscription.updated',
        created: 1781200000,
      } as never)
    ).resolves.toBe(true);
  });

  it('skips duplicate event ids', async () => {
    await expect(
      markWebhookEventProcessing(fakeSupabaseInsert({ code: '23505', message: 'duplicate' }) as never, {
        id: 'evt_123',
        type: 'customer.subscription.updated',
        created: 1781200000,
      } as never)
    ).resolves.toBe(false);
  });

  it('allows failed duplicate event ids to retry', async () => {
    await expect(
      markWebhookEventProcessing(fakeFailedDuplicateSupabase() as never, {
        id: 'evt_123',
        type: 'customer.subscription.updated',
        created: 1781200000,
      } as never)
    ).resolves.toBe(true);
  });
});

describe('stripe subscription projection transitions', () => {
  beforeEach(() => {
    vi.stubEnv('STRIPE_PRICE_MONTHLY_ID', 'price_monthly');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('projects active subscriptions into paid entitlements', async () => {
    const supabase = createInMemoryBillingSupabase();

    await processStripeEvent(
      createEventFixture({
        type: 'customer.subscription.updated',
        object: createSubscriptionFixture({ status: 'active' }),
      }) as never,
      { subscriptions: { retrieve: async () => createSubscriptionFixture({ status: 'active' }) } } as never,
      supabase as never
    );

    expect(supabase.state.billing_subscriptions[0]).toMatchObject({
      subscription_id: 'sub_123',
      stripe_customer_id: 'cus_123',
      user_id: 'user-1',
      price_id: 'price_monthly',
      status: 'active',
    });
    expect(supabase.state.billing_entitlements[0]).toMatchObject({
      user_id: 'user-1',
      plan_key: 'keen_plus',
      can_use_cloud_models: true,
      monthly_limit: 2500,
      display_state: 'active',
    });
  });

  it('projects newly created subscriptions into paid entitlements', async () => {
    const supabase = createInMemoryBillingSupabase();

    await processStripeEvent(
      createEventFixture({
        type: 'customer.subscription.created',
        object: createSubscriptionFixture({ status: 'active' }),
      }) as never,
      { subscriptions: { retrieve: async () => createSubscriptionFixture({ status: 'active' }) } } as never,
      supabase as never
    );

    expect(supabase.state.billing_subscriptions[0]).toMatchObject({
      subscription_id: 'sub_123',
      status: 'active',
    });
    expect(supabase.state.billing_entitlements[0]).toMatchObject({
      plan_key: 'keen_plus',
      can_use_cloud_models: true,
      display_state: 'active',
    });
  });

  it('projects failed payments into free access with a payment failed display state', async () => {
    const supabase = createInMemoryBillingSupabase();
    const stripe = {
      subscriptions: {
        retrieve: async () => createSubscriptionFixture({ status: 'past_due' }),
      },
    };

    await processStripeEvent(
      createInvoicePaymentEventFixture({
        type: 'invoice.payment_failed',
        paymentIntentStatus: 'requires_payment_method',
      }) as never,
      stripe as never,
      supabase as never
    );

    expect(supabase.state.billing_subscriptions[0]).toMatchObject({
      status: 'past_due',
      latest_invoice_status: 'payment_failed',
      latest_payment_intent_status: 'requires_payment_method',
    });
    expect(supabase.state.billing_entitlements[0]).toMatchObject({
      plan_key: 'free',
      can_use_cloud_models: false,
      display_state: 'payment_failed',
    });
  });

  it('keeps access while canceling at period end and ignores older subscription events', async () => {
    const supabase = createInMemoryBillingSupabase();

    await processStripeEvent(
      createEventFixture({
        type: 'customer.subscription.updated',
        object: createSubscriptionFixture({ status: 'active', cancelAtPeriodEnd: true }),
        created: 200,
      }) as never,
      { subscriptions: { retrieve: async () => createSubscriptionFixture({ status: 'active' }) } } as never,
      supabase as never
    );
    await processStripeEvent(
      createEventFixture({
        type: 'customer.subscription.deleted',
        object: createSubscriptionFixture({ status: 'canceled' }),
        created: 100,
      }) as never,
      { subscriptions: { retrieve: async () => createSubscriptionFixture({ status: 'canceled' }) } } as never,
      supabase as never
    );

    expect(supabase.state.billing_subscriptions[0]).toMatchObject({
      status: 'active',
      cancel_at_period_end: true,
    });
    expect(supabase.state.billing_entitlements[0]).toMatchObject({
      plan_key: 'keen_plus',
      can_use_cloud_models: true,
      display_state: 'canceling_at_period_end',
    });
  });

  it('does not let a same-second lower event id overwrite a higher event id', async () => {
    const supabase = createInMemoryBillingSupabase();

    await processStripeEvent(
      createEventFixture({
        id: 'evt_z',
        type: 'customer.subscription.updated',
        object: createSubscriptionFixture({ status: 'active', cancelAtPeriodEnd: true }),
        created: 200,
      }) as never,
      { subscriptions: { retrieve: async () => createSubscriptionFixture({ status: 'active' }) } } as never,
      supabase as never
    );
    await processStripeEvent(
      createEventFixture({
        id: 'evt_a',
        type: 'customer.subscription.deleted',
        object: createSubscriptionFixture({ status: 'canceled' }),
        created: 200,
      }) as never,
      { subscriptions: { retrieve: async () => createSubscriptionFixture({ status: 'canceled' }) } } as never,
      supabase as never
    );

    expect(supabase.state.billing_subscriptions[0]).toMatchObject({
      status: 'active',
      cancel_at_period_end: true,
      last_stripe_event_id: 'evt_z',
    });
    expect(supabase.state.billing_entitlements[0]).toMatchObject({
      plan_key: 'keen_plus',
      can_use_cloud_models: true,
      display_state: 'canceling_at_period_end',
    });
  });

  it('projects future cancel_at as canceling at period end', async () => {
    const supabase = createInMemoryBillingSupabase();
    const cancelAt = unixSeconds('2026-07-01T00:00:00.000Z');

    await processStripeEvent(
      createEventFixture({
        type: 'customer.subscription.updated',
        object: createSubscriptionFixture({ status: 'active', cancelAt }),
        created: unixSeconds('2026-06-12T00:00:00.000Z'),
      }) as never,
      { subscriptions: { retrieve: async () => createSubscriptionFixture({ status: 'active', cancelAt }) } } as never,
      supabase as never
    );

    expect(supabase.state.billing_subscriptions[0]).toMatchObject({
      status: 'active',
      cancel_at_period_end: false,
      cancel_at: '2026-07-01T00:00:00.000Z',
    });
    expect(supabase.state.billing_entitlements[0]).toMatchObject({
      plan_key: 'keen_plus',
      can_use_cloud_models: true,
      display_state: 'canceling_at_period_end',
    });
  });

  it('links checkout session completion to a customer, subscription, and paid entitlement', async () => {
    const supabase = createInMemoryBillingSupabase();

    await processStripeEvent(
      createCheckoutSessionCompletedEventFixture() as never,
      {
        subscriptions: {
          retrieve: async (subscriptionId: string) =>
            createSubscriptionFixture({ id: subscriptionId, status: 'active' }),
        },
      } as never,
      supabase as never
    );

    expect(supabase.state.billing_customers[0]).toMatchObject({
      user_id: 'user-1',
      stripe_customer_id: 'cus_123',
    });
    expect(supabase.state.billing_subscriptions[0]).toMatchObject({
      subscription_id: 'sub_123',
      status: 'active',
    });
    expect(supabase.state.billing_entitlements[0]).toMatchObject({
      plan_key: 'keen_plus',
      can_use_cloud_models: true,
      display_state: 'active',
    });
  });

  it('syncs a successful checkout return from Stripe when the webhook projection is delayed', async () => {
    const supabase = createInMemoryBillingSupabase();

    const result = await syncCheckoutSessionBilling(
      supabase as never,
      {
        checkout: {
          sessions: {
            retrieve: async () => ({
              id: 'cs_123',
              mode: 'subscription',
              client_reference_id: 'user-1',
              metadata: { user_id: 'user-1' },
              customer: 'cus_123',
              customer_email: 'user@example.com',
              customer_details: { email: 'user@example.com' },
              subscription: 'sub_123',
            }),
          },
        },
        subscriptions: {
          retrieve: async () => createSubscriptionFixture({ status: 'active' }),
        },
      } as never,
      'user-1',
      'cs_123'
    );

    expect(result).toMatchObject({
      userId: 'user-1',
      stripeCustomerId: 'cus_123',
      entitlement: {
        planKey: 'keen_plus',
        canUseCloudModels: true,
        displayState: 'active',
      },
    });
    expect(supabase.state.billing_customers[0]).toMatchObject({
      user_id: 'user-1',
      stripe_customer_id: 'cus_123',
    });
    expect(supabase.state.billing_subscriptions[0]).toMatchObject({
      subscription_id: 'sub_123',
      status: 'active',
      last_stripe_event_id: 'checkout.session.sync:cs_123',
    });
    expect(supabase.state.billing_entitlements[0]).toMatchObject({
      plan_key: 'keen_plus',
      can_use_cloud_models: true,
      display_state: 'active',
    });
  });

  it('fails checkout return sync loudly when the monthly Stripe price is not configured', async () => {
    vi.unstubAllEnvs();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const supabase = createInMemoryBillingSupabase();

    await expect(
      syncCheckoutSessionBilling(
        supabase as never,
        {
          checkout: {
            sessions: {
              retrieve: async () => ({
                id: 'cs_123',
                mode: 'subscription',
                client_reference_id: 'user-1',
                metadata: { user_id: 'user-1' },
                customer: 'cus_123',
                subscription: 'sub_123',
              }),
            },
          },
          subscriptions: {
            retrieve: async () => createSubscriptionFixture({ status: 'active' }),
          },
        } as never,
        'user-1',
        'cs_123'
      )
    ).rejects.toThrow('Stripe monthly price is not configured');

    expect(consoleError).toHaveBeenCalledWith(
      '[billing] Stripe monthly price is not configured; skipping live billing reconciliation'
    );
    expect(supabase.state.billing_customers).toHaveLength(0);
    expect(supabase.state.billing_subscriptions).toHaveLength(0);
    expect(supabase.state.billing_entitlements).toHaveLength(0);
    consoleError.mockRestore();
  });

  it('does not sync checkout return subscriptions for a different Stripe price', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const supabase = createInMemoryBillingSupabase();

    const result = await syncCheckoutSessionBilling(
      supabase as never,
      {
        checkout: {
          sessions: {
            retrieve: async () => ({
              id: 'cs_123',
              mode: 'subscription',
              client_reference_id: 'user-1',
              metadata: { user_id: 'user-1' },
              customer: 'cus_123',
              subscription: 'sub_123',
            }),
          },
        },
        subscriptions: {
          retrieve: async () =>
            createSubscriptionFixture({ status: 'active', priceId: 'price_other' }),
        },
      } as never,
      'user-1',
      'cs_123'
    );

    expect(result).toBeNull();
    expect(consoleWarn).toHaveBeenCalledWith(
      '[billing] checkout subscription does not include configured monthly price',
      { subscriptionId: 'sub_123' }
    );
    expect(supabase.state.billing_customers[0]).toMatchObject({
      user_id: 'user-1',
      stripe_customer_id: 'cus_123',
    });
    expect(supabase.state.billing_subscriptions).toHaveLength(0);
    expect(supabase.state.billing_entitlements).toHaveLength(0);
    consoleWarn.mockRestore();
  });

  it('syncs a mapped customer from Stripe when the webhook projection is delayed', async () => {
    const supabase = createInMemoryBillingSupabase();
    supabase.state.billing_customers.push({
      user_id: 'user-1',
      stripe_customer_id: 'cus_123',
    });
    const liveSubscription = createSubscriptionFixture({ status: 'active' });

    const result = await syncBillingCustomerFromStripe(
      supabase as never,
      {
        subscriptions: {
          list: async () => ({ data: [liveSubscription] }),
          retrieve: async (subscriptionId: string) =>
            createSubscriptionFixture({ id: subscriptionId, status: 'active' }),
        },
      } as never,
      'user-1',
      { now: new Date('2026-06-19T00:00:00.000Z') }
    );

    expect(result).toMatchObject({
      userId: 'user-1',
      stripeCustomerId: 'cus_123',
      entitlement: {
        planKey: 'keen_plus',
        canUseCloudModels: true,
        displayState: 'active',
      },
    });
    expect(supabase.state.billing_subscriptions[0]).toMatchObject({
      subscription_id: 'sub_123',
      status: 'active',
      last_stripe_event_id: 'billing.customer.sync:sub_123:1781827200',
    });
    expect(supabase.state.billing_entitlements[0]).toMatchObject({
      plan_key: 'keen_plus',
      can_use_cloud_models: true,
      display_state: 'active',
    });
  });

  it('stores the configured monthly price when it is not the first Stripe item', async () => {
    const supabase = createInMemoryBillingSupabase();
    supabase.state.billing_customers.push({
      user_id: 'user-1',
      stripe_customer_id: 'cus_123',
    });
    const liveSubscription = createSubscriptionFixture({ status: 'active' });
    liveSubscription.items.data.unshift({
      ...liveSubscription.items.data[0],
      id: 'si_other',
      price: {
        ...liveSubscription.items.data[0].price,
        id: 'price_other',
      },
    });

    const result = await syncBillingCustomerFromStripe(
      supabase as never,
      {
        subscriptions: {
          list: async () => ({ data: [liveSubscription] }),
          retrieve: async () => liveSubscription,
        },
      } as never,
      'user-1',
      { now: new Date('2026-06-19T00:00:00.000Z') }
    );

    expect(supabase.state.billing_subscriptions[0]).toMatchObject({
      subscription_id: 'sub_123',
      price_id: 'price_monthly',
      status: 'active',
    });
    expect(result).toMatchObject({
      entitlement: {
        planKey: 'keen_plus',
        canUseCloudModels: true,
        displayState: 'active',
      },
    });
  });

  it('checks every Stripe subscription page before projecting free access', async () => {
    const supabase = createInMemoryBillingSupabase();
    supabase.state.billing_customers.push({
      user_id: 'user-1',
      stripe_customer_id: 'cus_123',
    });
    const otherSubscription = createSubscriptionFixture({
      id: 'sub_other',
      status: 'active',
      priceId: 'price_other',
    });
    const monthlySubscription = createSubscriptionFixture({ status: 'active' });
    const list = vi.fn()
      .mockResolvedValueOnce({ data: [otherSubscription], has_more: true })
      .mockResolvedValueOnce({ data: [monthlySubscription], has_more: false });

    const result = await syncBillingCustomerFromStripe(
      supabase as never,
      {
        subscriptions: {
          list,
          retrieve: async (subscriptionId: string) =>
            subscriptionId === 'sub_other' ? otherSubscription : monthlySubscription,
        },
      } as never,
      'user-1',
      { now: new Date('2026-06-19T00:00:00.000Z') }
    );

    expect(list).toHaveBeenNthCalledWith(1, {
      customer: 'cus_123',
      status: 'all',
      limit: 100,
    });
    expect(list).toHaveBeenNthCalledWith(2, {
      customer: 'cus_123',
      status: 'all',
      limit: 100,
      starting_after: 'sub_other',
    });
    expect(result).toMatchObject({
      entitlement: {
        planKey: 'keen_plus',
        canUseCloudModels: true,
        displayState: 'active',
      },
    });
  });

  it('preserves billing customer email when subscription sync has no email', async () => {
    const supabase = createInMemoryBillingSupabase();
    supabase.state.billing_customers.push({
      user_id: 'user-1',
      stripe_customer_id: 'cus_123',
      email: 'user@example.com',
    });

    await syncBillingCustomerFromStripe(
      supabase as never,
      {
        subscriptions: {
          list: async () => ({ data: [createSubscriptionFixture({ status: 'active' })] }),
          retrieve: async () => createSubscriptionFixture({ status: 'active' }),
        },
      } as never,
      'user-1',
      { now: new Date('2026-06-19T00:00:00.000Z') }
    );

    expect(supabase.state.billing_customers[0]).toMatchObject({
      user_id: 'user-1',
      stripe_customer_id: 'cus_123',
      email: 'user@example.com',
    });
  });

  it('syncs portal cancel-at-period-end changes from live Stripe', async () => {
    const supabase = createInMemoryBillingSupabase();

    await processStripeEvent(
      createEventFixture({
        type: 'customer.subscription.updated',
        object: createSubscriptionFixture({ status: 'active' }),
        created: unixSeconds('2026-06-12T00:00:00.000Z'),
      }) as never,
      {
        subscriptions: {
          retrieve: async () => createSubscriptionFixture({ status: 'active' }),
        },
      } as never,
      supabase as never
    );

    const result = await syncBillingCustomerFromStripe(
      supabase as never,
      {
        subscriptions: {
          list: async () => ({ data: [createSubscriptionFixture({ status: 'active' })] }),
          retrieve: async () =>
            createSubscriptionFixture({ status: 'active', cancelAtPeriodEnd: true }),
        },
      } as never,
      'user-1',
      { now: new Date('2026-06-19T00:00:00.000Z') }
    );

    expect(result).toMatchObject({
      entitlement: {
        planKey: 'keen_plus',
        canUseCloudModels: true,
        displayState: 'canceling_at_period_end',
      },
    });
    expect(supabase.state.billing_subscriptions[0]).toMatchObject({
      status: 'active',
      cancel_at_period_end: true,
    });
    expect(supabase.state.billing_entitlements[0]).toMatchObject({
      plan_key: 'keen_plus',
      can_use_cloud_models: true,
      display_state: 'canceling_at_period_end',
    });
  });

  it('lets live Stripe sync overwrite rows that webhook ordering would reject', async () => {
    const supabase = createInMemoryBillingSupabase();
    supabase.state.billing_customers.push({
      user_id: 'user-1',
      stripe_customer_id: 'cus_123',
    });
    supabase.state.billing_subscriptions.push({
      subscription_id: 'sub_123',
      stripe_customer_id: 'cus_123',
      user_id: 'user-1',
      price_id: 'price_monthly',
      status: 'active',
      current_period_start: '2026-06-01T00:00:00.000Z',
      current_period_end: '2026-07-01T00:00:00.000Z',
      cancel_at_period_end: false,
      latest_invoice_status: null,
      last_stripe_event_id: 'evt_future',
      last_stripe_event_created: '2099-01-01T00:00:00.000Z',
    });

    const result = await syncBillingCustomerFromStripe(
      supabase as never,
      {
        subscriptions: {
          list: async () => ({ data: [createSubscriptionFixture({ status: 'canceled' })] }),
          retrieve: async () => createSubscriptionFixture({ status: 'canceled' }),
        },
      } as never,
      'user-1',
      { now: new Date('2026-06-19T00:00:00.000Z') }
    );

    expect(supabase.state.billing_subscriptions[0]).toMatchObject({
      subscription_id: 'sub_123',
      status: 'canceled',
      last_stripe_event_id: 'billing.customer.sync:sub_123:1781827200',
    });
    expect(result).toMatchObject({
      entitlement: {
        planKey: 'free',
        canUseCloudModels: false,
        displayState: 'canceled',
      },
    });
    expect(supabase.state.billing_entitlements[0]).toMatchObject({
      plan_key: 'free',
      can_use_cloud_models: false,
      display_state: 'canceled',
    });
  });

  it('preserves payment failure details from live Stripe subscription invoices', async () => {
    const supabase = createInMemoryBillingSupabase();
    supabase.state.billing_customers.push({
      user_id: 'user-1',
      stripe_customer_id: 'cus_123',
    });
    const failedSubscription = {
      ...createSubscriptionFixture({ status: 'past_due' }),
      latest_invoice: {
        id: 'in_failed',
        object: 'invoice',
        status: 'open',
        payment_intent: {
          id: 'pi_failed',
          object: 'payment_intent',
          status: 'requires_payment_method',
        },
      },
    };

    const result = await syncBillingCustomerFromStripe(
      supabase as never,
      {
        subscriptions: {
          list: async () => ({ data: [failedSubscription] }),
          retrieve: async () => failedSubscription,
        },
      } as never,
      'user-1',
      { now: new Date('2026-06-19T00:00:00.000Z') }
    );

    expect(supabase.state.billing_subscriptions[0]).toMatchObject({
      status: 'past_due',
      latest_invoice_id: 'in_failed',
      latest_invoice_status: 'payment_failed',
      latest_payment_intent_status: 'requires_payment_method',
    });
    expect(result).toMatchObject({
      entitlement: {
        planKey: 'free',
        canUseCloudModels: false,
        displayState: 'payment_failed',
      },
    });
  });

  it('fails live customer sync loudly when the monthly Stripe price is not configured', async () => {
    vi.unstubAllEnvs();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const supabase = createInMemoryBillingSupabase();
    supabase.state.billing_customers.push({
      user_id: 'user-1',
      stripe_customer_id: 'cus_123',
    });

    await expect(
      syncBillingCustomerFromStripe(
        supabase as never,
        {
          subscriptions: {
            list: async () => ({ data: [createSubscriptionFixture({ status: 'active' })] }),
            retrieve: async () => createSubscriptionFixture({ status: 'active' }),
          },
        } as never,
        'user-1'
      )
    ).rejects.toThrow('Stripe monthly price is not configured');

    expect(consoleError).toHaveBeenCalledWith(
      '[billing] Stripe monthly price is not configured; skipping live billing reconciliation'
    );
    expect(supabase.state.billing_subscriptions).toHaveLength(0);
    expect(supabase.state.billing_entitlements).toHaveLength(0);
    consoleError.mockRestore();
  });

  it('projects free access when live Stripe has no app subscription for a mapped customer', async () => {
    const supabase = createInMemoryBillingSupabase();

    await processStripeEvent(
      createEventFixture({
        type: 'customer.subscription.updated',
        object: createSubscriptionFixture({ status: 'active' }),
        created: unixSeconds('2026-06-12T00:00:00.000Z'),
      }) as never,
      {
        subscriptions: {
          retrieve: async () => createSubscriptionFixture({ status: 'active' }),
        },
      } as never,
      supabase as never
    );

    const result = await syncBillingCustomerFromStripe(
      supabase as never,
      {
        subscriptions: {
          list: async () => ({
            data: [createSubscriptionFixture({ status: 'active', priceId: 'price_other' })],
          }),
          retrieve: async () =>
            createSubscriptionFixture({ status: 'active', priceId: 'price_other' }),
        },
      } as never,
      'user-1',
      { now: new Date('2026-06-19T00:00:00.000Z') }
    );

    expect(result).toMatchObject({
      userId: 'user-1',
      stripeCustomerId: 'cus_123',
      entitlement: {
        planKey: 'free',
        canUseCloudModels: false,
        displayState: 'canceled',
      },
    });
    expect(supabase.state.billing_subscriptions[0]).toMatchObject({
      subscription_id: 'sub_123',
      status: 'canceled',
      last_stripe_event_id: 'billing.customer.sync:stale:sub_123:1781827200',
    });
    expect(supabase.state.billing_entitlements[0]).toMatchObject({
      plan_key: 'free',
      can_use_cloud_models: false,
      display_state: 'canceled',
    });

    await refreshBillingEntitlement(supabase as never, 'user-1');

    expect(supabase.state.billing_entitlements[0]).toMatchObject({
      plan_key: 'free',
      can_use_cloud_models: false,
      display_state: 'canceled',
    });
  });

  it('does not sync checkout sessions that belong to a different user', async () => {
    const supabase = createInMemoryBillingSupabase();

    await expect(
      syncCheckoutSessionBilling(
        supabase as never,
        {
          checkout: {
            sessions: {
              retrieve: async () => ({
                id: 'cs_123',
                mode: 'subscription',
                client_reference_id: 'other-user',
                metadata: { user_id: 'other-user' },
                customer: 'cus_123',
                subscription: 'sub_123',
              }),
            },
          },
          subscriptions: {
            retrieve: async () => createSubscriptionFixture({ status: 'active' }),
          },
        } as never,
        'user-1',
        'cs_123'
      )
    ).resolves.toBeNull();

    expect(supabase.state.billing_subscriptions).toHaveLength(0);
    expect(supabase.state.billing_entitlements).toHaveLength(0);
  });

  it('does not let null-period rows outrank subscriptions with period dates', async () => {
    const supabase = createInMemoryBillingSupabase();
    supabase.state.billing_customers.push({
      user_id: 'user-1',
      stripe_customer_id: 'cus_123',
    });
    supabase.state.billing_subscriptions.push(
      {
        subscription_id: 'sub_incomplete',
        stripe_customer_id: 'cus_123',
        user_id: 'user-1',
        price_id: 'price_monthly',
        status: 'incomplete',
        current_period_start: null,
        current_period_end: null,
        cancel_at_period_end: false,
        latest_invoice_status: null,
        last_stripe_event_created: '2026-07-05T00:00:00.000Z',
      },
      {
        subscription_id: 'sub_canceled',
        stripe_customer_id: 'cus_123',
        user_id: 'user-1',
        price_id: 'price_monthly',
        status: 'canceled',
        current_period_start: '2026-06-01T00:00:00.000Z',
        current_period_end: '2026-07-01T00:00:00.000Z',
        cancel_at_period_end: false,
        latest_invoice_status: null,
        last_stripe_event_created: '2026-07-01T00:00:00.000Z',
      }
    );

    await refreshBillingEntitlement(supabase as never, 'user-1');

    expect(supabase.state.billing_entitlements[0]).toMatchObject({
      plan_key: 'free',
      subscription_id: 'sub_canceled',
      display_state: 'canceled',
    });
  });

  it('projects deleted subscriptions into canceled free access', async () => {
    const supabase = createInMemoryBillingSupabase();

    await processStripeEvent(
      createEventFixture({
        type: 'customer.subscription.deleted',
        object: createSubscriptionFixture({ status: 'canceled' }),
      }) as never,
      {
        subscriptions: {
          retrieve: async () => createSubscriptionFixture({ status: 'canceled' }),
        },
      } as never,
      supabase as never
    );

    expect(supabase.state.billing_subscriptions[0]).toMatchObject({
      status: 'canceled',
    });
    expect(supabase.state.billing_entitlements[0]).toMatchObject({
      plan_key: 'free',
      can_use_cloud_models: false,
      display_state: 'canceled',
    });
  });

  it('projects successful invoice payment back into active paid access', async () => {
    const supabase = createInMemoryBillingSupabase();
    const stripe = {
      subscriptions: {
        retrieve: async () => createSubscriptionFixture({ status: 'active' }),
      },
    };

    await processStripeEvent(
      createInvoicePaymentEventFixture({ type: 'invoice.payment_succeeded' }) as never,
      stripe as never,
      supabase as never
    );

    expect(supabase.state.billing_subscriptions[0]).toMatchObject({
      status: 'active',
      latest_invoice_status: 'payment_succeeded',
    });
    expect(supabase.state.billing_entitlements[0]).toMatchObject({
      plan_key: 'keen_plus',
      can_use_cloud_models: true,
      display_state: 'active',
    });
  });
});

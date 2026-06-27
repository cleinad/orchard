import Stripe from 'stripe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  createCheckoutSessionCompletedEventFixture,
  createSubscriptionFixture,
} from '../fixtures/stripe-events';
import { createInMemoryBillingSupabase } from '../helpers/in-memory-billing-supabase';

const webhookSecret = 'whsec_test_secret';
const stripe = new Stripe('sk_test_123');
const mockCreateSupabaseServiceRoleClient = vi.fn();
const mockRetrieveSubscription = vi.fn();

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServiceRoleClient: () => mockCreateSupabaseServiceRoleClient(),
}));

vi.mock('@/lib/stripe', () => ({
  getStripe: () => ({
    webhooks: stripe.webhooks,
    subscriptions: {
      retrieve: (...args: unknown[]) => mockRetrieveSubscription(...args),
    },
  }),
}));

function createSignedWebhookRequest(event: object, secret = webhookSecret) {
  const payload = JSON.stringify(event);
  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret,
  });

  return new NextRequest('http://localhost/api/stripe/webhook', {
    method: 'POST',
    headers: {
      'stripe-signature': signature,
      'content-type': 'application/json',
    },
    body: payload,
  });
}

describe('stripe webhook route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', webhookSecret);
    vi.stubEnv('STRIPE_PRICE_MONTHLY_ID', 'price_monthly');
    mockRetrieveSubscription.mockResolvedValue(
      createSubscriptionFixture({ status: 'active' })
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('requires a configured webhook secret', async () => {
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', '');

    const { POST } = await import('@/app/api/stripe/webhook/route');
    const response = await POST(
      new NextRequest('http://localhost/api/stripe/webhook', {
        method: 'POST',
        headers: { 'stripe-signature': 'ignored' },
        body: '{}',
      })
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: 'Stripe webhook secret is not configured',
    });
  });

  it('requires a Stripe signature header', async () => {
    const { POST } = await import('@/app/api/stripe/webhook/route');
    const response = await POST(
      new NextRequest('http://localhost/api/stripe/webhook', {
        method: 'POST',
        body: '{}',
      })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Missing Stripe signature' });
  });

  it('rejects invalid webhook signatures', async () => {
    const event = createCheckoutSessionCompletedEventFixture();

    const { POST } = await import('@/app/api/stripe/webhook/route');
    const response = await POST(createSignedWebhookRequest(event, 'whsec_wrong_secret'));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid signature' });
    expect(mockCreateSupabaseServiceRoleClient).not.toHaveBeenCalled();
  });

  it('processes signed checkout completion payloads and records the webhook event', async () => {
    const supabase = createInMemoryBillingSupabase();
    mockCreateSupabaseServiceRoleClient.mockReturnValue(supabase);
    const event = createCheckoutSessionCompletedEventFixture();

    const { POST } = await import('@/app/api/stripe/webhook/route');
    const response = await POST(createSignedWebhookRequest(event));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
    expect(mockRetrieveSubscription).toHaveBeenCalledWith('sub_123', {
      expand: ['latest_invoice.payment_intent'],
    });
    expect(supabase.state.billing_webhook_events[0]).toMatchObject({
      event_id: 'evt_checkout_completed',
      type: 'checkout.session.completed',
      processing_status: 'processed',
    });
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
    });
  });

  it('skips duplicate signed webhook deliveries by event id', async () => {
    const supabase = createInMemoryBillingSupabase();
    mockCreateSupabaseServiceRoleClient.mockReturnValue(supabase);
    const event = createCheckoutSessionCompletedEventFixture();

    const { POST } = await import('@/app/api/stripe/webhook/route');
    const firstResponse = await POST(createSignedWebhookRequest(event));
    const secondResponse = await POST(createSignedWebhookRequest(event));

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(await secondResponse.json()).toEqual({
      received: true,
      duplicate: true,
    });
    expect(mockRetrieveSubscription).toHaveBeenCalledTimes(1);
    expect(supabase.state.billing_webhook_events).toHaveLength(1);
    expect(supabase.state.billing_webhook_events[0]).toMatchObject({
      event_id: 'evt_checkout_completed',
      processing_status: 'processed',
    });
  });
});

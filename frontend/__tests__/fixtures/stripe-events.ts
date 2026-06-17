import stripeWebhookEvents from './stripe-webhook-events.json';

export const STRIPE_TEST_CREATED = 1781200000;

function cloneFixture<T>(fixture: T): T {
  return JSON.parse(JSON.stringify(fixture)) as T;
}

export function unixSeconds(iso: string) {
  return Date.parse(iso) / 1000;
}

export function createSubscriptionFixture({
  id = 'sub_123',
  customerId = 'cus_123',
  userId = 'user-1',
  priceId = 'price_monthly',
  status,
  cancelAtPeriodEnd = false,
  cancelAt = null,
  currentPeriodStart = '2026-06-01T00:00:00.000Z',
  currentPeriodEnd = '2026-07-01T00:00:00.000Z',
}: {
  id?: string;
  customerId?: string;
  userId?: string;
  priceId?: string;
  status: string;
  cancelAtPeriodEnd?: boolean;
  cancelAt?: number | null;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
}) {
  return {
    id,
    object: 'subscription',
    customer: customerId,
    status,
    cancel_at_period_end: cancelAtPeriodEnd,
    cancel_at: cancelAt,
    canceled_at: status === 'canceled' ? unixSeconds(currentPeriodEnd) : null,
    metadata: { user_id: userId },
    current_period_start: unixSeconds(currentPeriodStart),
    current_period_end: unixSeconds(currentPeriodEnd),
    items: {
      object: 'list',
      data: [
        {
          id: 'si_123',
          object: 'subscription_item',
          current_period_start: unixSeconds(currentPeriodStart),
          current_period_end: unixSeconds(currentPeriodEnd),
          price: {
            id: priceId,
            object: 'price',
            recurring: { interval: 'month' },
          },
        },
      ],
    },
    latest_invoice: 'in_123',
  };
}

export function createEventFixture({
  id,
  type,
  object,
  created = STRIPE_TEST_CREATED,
}: {
  id?: string;
  type: string;
  object: object;
  created?: number;
}) {
  return {
    id: id ?? `evt_${type}_${created}`.replaceAll('.', '_'),
    object: 'event',
    api_version: '2026-02-01.preview',
    created,
    livemode: false,
    pending_webhooks: 1,
    request: { id: 'req_123', idempotency_key: null },
    type,
    data: { object },
  };
}

export function createCheckoutSessionCompletedEventFixture({
  id = 'evt_checkout_completed',
  created = STRIPE_TEST_CREATED,
  userId = 'user-1',
  customerId = 'cus_123',
  subscriptionId = 'sub_123',
  priceId = 'price_monthly',
}: {
  id?: string;
  created?: number;
  userId?: string;
  customerId?: string;
  subscriptionId?: string;
  priceId?: string;
} = {}) {
  const event = cloneFixture(stripeWebhookEvents.checkoutSessionCompleted);
  event.id = id;
  event.created = created;
  event.data.object.client_reference_id = userId;
  event.data.object.customer = customerId;
  event.data.object.subscription = subscriptionId;
  event.data.object.metadata.user_id = userId;
  event.data.object.metadata.price_id = priceId;
  return event;
}

export function createInvoicePaymentEventFixture({
  id,
  type,
  created = STRIPE_TEST_CREATED,
  subscriptionId = 'sub_123',
  paymentIntentStatus = 'succeeded',
}: {
  id?: string;
  type: 'invoice.payment_succeeded' | 'invoice.payment_failed';
  created?: number;
  subscriptionId?: string;
  paymentIntentStatus?: string;
}) {
  return createEventFixture({
    id,
    type,
    created,
    object: {
      id: type === 'invoice.payment_failed' ? 'in_failed' : 'in_succeeded',
      object: 'invoice',
      status: type === 'invoice.payment_failed' ? 'open' : 'paid',
      parent: { subscription_details: { subscription: subscriptionId } },
      payment_intent: { id: 'pi_123', object: 'payment_intent', status: paymentIntentStatus },
    },
  });
}

import type Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  computeEntitlementFromSubscription,
  getFreeBillingEntitlement,
  type BillingEntitlement,
  type BillingSubscriptionProjection,
} from '@/lib/billing';

type StripeLike = Pick<Stripe, 'subscriptions'>;
type StripeCheckoutLike = Pick<Stripe, 'checkout' | 'subscriptions'>;

export interface BillingSyncResult {
  userId: string;
  stripeCustomerId: string | null;
  entitlement: BillingEntitlement;
}

interface BillingCustomerSyncOptions {
  now?: Date;
  stripeCustomerId?: string | null;
}

const FAILED_PAYMENT_INTENT_STATUSES = new Set([
  'canceled',
  'requires_action',
  'requires_payment_method',
]);

function stringOrNull(value: unknown) {
  return typeof value === 'string' ? value : null;
}

function stripeObjectId(value: unknown): string | null {
  if (!value) {
    return null;
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'object' && 'id' in value && typeof value.id === 'string') {
    return value.id;
  }

  return null;
}

function unixToIso(value: unknown): string | null {
  if (typeof value !== 'number') {
    return null;
  }

  return new Date(value * 1000).toISOString();
}

function getSubscriptionPeriod(subscription: Stripe.Subscription) {
  const rawSubscription = subscription as unknown as {
    current_period_start?: number;
    current_period_end?: number;
    items?: { data?: Array<{ current_period_start?: number; current_period_end?: number }> };
  };
  const firstItem = rawSubscription.items?.data?.[0];

  return {
    currentPeriodStart: unixToIso(
      rawSubscription.current_period_start ?? firstItem?.current_period_start
    ),
    currentPeriodEnd: unixToIso(
      rawSubscription.current_period_end ?? firstItem?.current_period_end
    ),
  };
}

function getSubscriptionPriceId(
  subscription: Stripe.Subscription,
  preferredPriceId?: string | null
) {
  if (
    preferredPriceId
    && subscription.items.data.some((item) => item.price?.id === preferredPriceId)
  ) {
    return preferredPriceId;
  }

  return subscription.items.data[0]?.price?.id ?? null;
}

function requireMonthlyStripePriceId() {
  const monthlyPriceId = process.env.STRIPE_PRICE_MONTHLY_ID;

  if (!monthlyPriceId) {
    console.error(
      '[billing] Stripe monthly price is not configured; skipping live billing reconciliation'
    );
    throw new Error(
      'Stripe monthly price is not configured. Set STRIPE_PRICE_MONTHLY_ID.'
    );
  }

  return monthlyPriceId;
}

function subscriptionHasConfiguredMonthlyPrice(
  subscription: Stripe.Subscription,
  monthlyPriceId: string
) {
  return subscription.items.data.some((item) => item.price?.id === monthlyPriceId);
}

function getExpandedInvoice(subscription: Stripe.Subscription) {
  const rawSubscription = subscription as unknown as {
    latest_invoice?: string | {
      status?: string | null;
      payment_intent?: string | { status?: string | null } | null;
    } | null;
  };

  return rawSubscription.latest_invoice
    && typeof rawSubscription.latest_invoice === 'object'
    ? rawSubscription.latest_invoice
    : null;
}

function getSubscriptionPaymentIntentStatus(subscription: Stripe.Subscription) {
  const invoice = getExpandedInvoice(subscription);

  if (
    invoice?.payment_intent
    && typeof invoice.payment_intent === 'object'
    && typeof invoice.payment_intent.status === 'string'
  ) {
    return invoice.payment_intent.status;
  }

  return null;
}

function getSubscriptionInvoiceStatus(subscription: Stripe.Subscription) {
  const invoice = getExpandedInvoice(subscription);
  const paymentIntentStatus = getSubscriptionPaymentIntentStatus(subscription);

  if (paymentIntentStatus && FAILED_PAYMENT_INTENT_STATUSES.has(paymentIntentStatus)) {
    return 'payment_failed';
  }

  return typeof invoice?.status === 'string' ? invoice.status : null;
}

async function getUserIdForCustomer(
  supabase: SupabaseClient,
  stripeCustomerId: string
) {
  const { data, error } = await supabase
    .from('billing_customers')
    .select('user_id')
    .eq('stripe_customer_id', stripeCustomerId)
    .maybeSingle();

  if (error) {
    console.error('[stripe] failed to find billing customer', error);
  }

  return typeof data?.user_id === 'string' ? data.user_id : null;
}

async function upsertBillingCustomer(
  supabase: SupabaseClient,
  userId: string,
  stripeCustomerId: string,
  email?: string | null
) {
  const row: {
    user_id: string;
    stripe_customer_id: string;
    updated_at: string;
    email?: string | null;
  } = {
    user_id: userId,
    stripe_customer_id: stripeCustomerId,
    updated_at: new Date().toISOString(),
  };

  if (email !== undefined) {
    row.email = email;
  }

  const { error } = await supabase
    .from('billing_customers')
    .upsert(row, { onConflict: 'user_id' });

  if (error) {
    throw new Error(`Failed to upsert billing customer: ${error.message}`);
  }
}

function dateTimeValue(value: string | null | undefined) {
  if (!value) {
    return Number.NEGATIVE_INFINITY;
  }

  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : Number.NEGATIVE_INFINITY;
}

function sortSubscriptionsForEntitlement(
  subscriptions: BillingSubscriptionProjection[]
) {
  return [...subscriptions].sort((left, right) => {
    const periodDiff =
      dateTimeValue(right.current_period_end) - dateTimeValue(left.current_period_end);

    if (periodDiff !== 0) {
      return periodDiff;
    }

    return (
      dateTimeValue(right.last_stripe_event_created)
      - dateTimeValue(left.last_stripe_event_created)
    );
  });
}

function computeEntitlementForSubscriptions(
  subscriptions: BillingSubscriptionProjection[]
) {
  const sortedSubscriptions = sortSubscriptionsForEntitlement(subscriptions);
  const activeSubscription =
    sortedSubscriptions.find(
      (subscription) =>
        computeEntitlementFromSubscription(subscription).canUseCloudModels
    )
    ?? sortedSubscriptions[0]
    ?? null;

  return computeEntitlementFromSubscription(activeSubscription);
}

function buildSubscriptionPayload(
  subscription: Stripe.Subscription,
  stripeCustomerId: string,
  userId: string,
  event: Pick<Stripe.Event, 'id' | 'created'>,
  latestInvoiceStatus?: string | null,
  latestPaymentIntentStatus?: string | null,
  priceId?: string | null
) {
  const { currentPeriodStart, currentPeriodEnd } = getSubscriptionPeriod(subscription);
  const rawSubscription = subscription as unknown as {
    cancel_at?: number | null;
    canceled_at?: number | null;
    trial_end?: number | null;
    latest_invoice?: unknown;
  };

  return {
    subscription_id: subscription.id,
    stripe_customer_id: stripeCustomerId,
    user_id: userId,
    price_id: getSubscriptionPriceId(subscription, priceId),
    status: subscription.status,
    current_period_start: currentPeriodStart,
    current_period_end: currentPeriodEnd,
    cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
    cancel_at: unixToIso(rawSubscription.cancel_at ?? null),
    canceled_at: unixToIso(rawSubscription.canceled_at ?? null),
    trial_end: unixToIso(rawSubscription.trial_end ?? null),
    latest_invoice_id: stripeObjectId(rawSubscription.latest_invoice),
    latest_invoice_status: latestInvoiceStatus ?? null,
    latest_payment_intent_status: latestPaymentIntentStatus ?? null,
    metadata: subscription.metadata ?? {},
    last_stripe_event_id: event.id,
    last_stripe_event_created: unixToIso(event.created),
    updated_at: new Date().toISOString(),
  };
}

async function upsertSubscriptionIfNewer(
  supabase: SupabaseClient,
  payload: ReturnType<typeof buildSubscriptionPayload>
) {
  const { data, error } = await supabase.rpc(
    'upsert_billing_subscription_if_newer',
    { p_subscription: payload }
  );

  if (error) {
    throw new Error(`Failed to upsert billing subscription: ${error.message}`);
  }

  return data === true;
}

async function upsertLiveSubscription(
  supabase: SupabaseClient,
  payload: ReturnType<typeof buildSubscriptionPayload>
) {
  const { error } = await supabase
    .from('billing_subscriptions')
    .upsert(payload, { onConflict: 'subscription_id' });

  if (error) {
    throw new Error(`Failed to upsert live billing subscription: ${error.message}`);
  }
}

async function cancelStaleMonthlySubscriptions(
  supabase: SupabaseClient,
  userId: string,
  monthlyPriceId: string,
  syncedSubscriptionIds: Set<string>,
  eventCreated: number
) {
  const { data, error } = await supabase
    .from('billing_subscriptions')
    .select(
      'subscription_id, stripe_customer_id, price_id, status, current_period_start, current_period_end, cancel_at_period_end, cancel_at, canceled_at, trial_end, latest_invoice_id, latest_invoice_status, latest_payment_intent_status, metadata, last_stripe_event_id, last_stripe_event_created'
    )
    .eq('user_id', userId)
    .eq('price_id', monthlyPriceId);

  if (error) {
    throw new Error(`Failed to load stale billing subscriptions: ${error.message}`);
  }

  const canceledAt = new Date().toISOString();
  const lastStripeEventCreated = unixToIso(eventCreated);
  const canceledSubscriptions: BillingSubscriptionProjection[] = [];

  for (const subscription of (data ?? []) as Array<Record<string, unknown>>) {
    const subscriptionId =
      typeof subscription.subscription_id === 'string'
        ? subscription.subscription_id
        : null;
    const stripeCustomerId =
      typeof subscription.stripe_customer_id === 'string'
        ? subscription.stripe_customer_id
        : null;

    if (!subscriptionId || !stripeCustomerId || syncedSubscriptionIds.has(subscriptionId)) {
      continue;
    }

    const payload = {
      subscription_id: subscriptionId,
      stripe_customer_id: stripeCustomerId,
      user_id: userId,
      price_id: monthlyPriceId,
      status: 'canceled',
      current_period_start: stringOrNull(subscription.current_period_start),
      current_period_end: stringOrNull(subscription.current_period_end),
      cancel_at_period_end: false,
      cancel_at: null,
      canceled_at:
        typeof subscription.canceled_at === 'string'
          ? subscription.canceled_at
          : canceledAt,
      trial_end: stringOrNull(subscription.trial_end),
      latest_invoice_id: stringOrNull(subscription.latest_invoice_id),
      latest_invoice_status: stringOrNull(subscription.latest_invoice_status),
      latest_payment_intent_status: stringOrNull(
        subscription.latest_payment_intent_status
      ),
      metadata:
        subscription.metadata && typeof subscription.metadata === 'object'
          ? subscription.metadata
          : {},
      last_stripe_event_id: `billing.customer.sync:stale:${subscriptionId}:${eventCreated}`,
      last_stripe_event_created: lastStripeEventCreated,
      updated_at: canceledAt,
    };

    await upsertLiveSubscription(
      supabase,
      payload as ReturnType<typeof buildSubscriptionPayload>
    );
    canceledSubscriptions.push(payload as BillingSubscriptionProjection);
  }

  return canceledSubscriptions;
}

async function upsertBillingEntitlement(
  supabase: SupabaseClient,
  userId: string,
  entitlement: BillingEntitlement
) {
  const { error } = await supabase
    .from('billing_entitlements')
    .upsert(
      {
        user_id: userId,
        plan_key: entitlement.planKey,
        can_use_cloud_models: entitlement.canUseCloudModels,
        monthly_limit: entitlement.monthlyLimit,
        status: entitlement.status,
        subscription_id: entitlement.subscriptionId,
        current_period_start: entitlement.currentPeriodStart,
        current_period_end: entitlement.currentPeriodEnd,
        display_state: entitlement.displayState,
        refreshed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );

  if (error) {
    throw new Error(`Failed to upsert billing entitlement: ${error.message}`);
  }
}

export async function refreshBillingEntitlement(
  supabase: SupabaseClient,
  userId: string
) {
  const { data, error } = await supabase
    .from('billing_subscriptions')
    .select(
      'subscription_id, price_id, status, current_period_start, current_period_end, cancel_at_period_end, cancel_at, latest_invoice_status, last_stripe_event_created'
    )
    .eq('user_id', userId);

  if (error) {
    throw new Error(`Failed to load billing subscriptions: ${error.message}`);
  }

  const entitlement = computeEntitlementForSubscriptions(
    (data ?? []) as BillingSubscriptionProjection[]
  );

  await upsertBillingEntitlement(supabase, userId, entitlement);
  return entitlement;
}

export async function persistStripeSubscription(
  supabase: SupabaseClient,
  subscription: Stripe.Subscription,
  event: Pick<Stripe.Event, 'id' | 'created'>,
  latestInvoiceStatus?: string | null,
  latestPaymentIntentStatus?: string | null
) {
  const stripeCustomerId = stripeObjectId(subscription.customer);
  if (!stripeCustomerId) {
    return null;
  }

  const metadataUserId =
    typeof subscription.metadata?.user_id === 'string'
      ? subscription.metadata.user_id
      : null;
  const userId = metadataUserId ?? (await getUserIdForCustomer(supabase, stripeCustomerId));

  if (!userId) {
    console.warn('[stripe] subscription event has no mapped user', {
      subscriptionId: subscription.id,
      stripeCustomerId,
    });
    return null;
  }

  await upsertBillingCustomer(supabase, userId, stripeCustomerId);

  await upsertSubscriptionIfNewer(
    supabase,
    buildSubscriptionPayload(
      subscription,
      stripeCustomerId,
      userId,
      event,
      latestInvoiceStatus,
      latestPaymentIntentStatus
    )
  );

  const entitlement = await refreshBillingEntitlement(supabase, userId);
  return { userId, stripeCustomerId, entitlement };
}

async function persistLiveStripeSubscription(
  supabase: SupabaseClient,
  subscription: Stripe.Subscription,
  userId: string,
  event: Pick<Stripe.Event, 'id' | 'created'>,
  monthlyPriceId: string
) {
  const stripeCustomerId = stripeObjectId(subscription.customer);
  if (!stripeCustomerId) {
    return null;
  }

  await upsertBillingCustomer(supabase, userId, stripeCustomerId);

  const payload = buildSubscriptionPayload(
    subscription,
    stripeCustomerId,
    userId,
    event,
    getSubscriptionInvoiceStatus(subscription),
    getSubscriptionPaymentIntentStatus(subscription),
    monthlyPriceId
  );

  await upsertLiveSubscription(supabase, payload);
  return payload;
}

async function retrieveSubscription(stripe: StripeLike, subscriptionId: string) {
  return stripe.subscriptions.retrieve(subscriptionId, {
    expand: ['latest_invoice.payment_intent'],
  });
}

async function listCustomerSubscriptions(
  stripe: StripeLike,
  stripeCustomerId: string
) {
  const subscriptions: Stripe.Subscription[] = [];
  let startingAfter: string | undefined;

  do {
    const page = await stripe.subscriptions.list({
      customer: stripeCustomerId,
      status: 'all',
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });

    subscriptions.push(...page.data);
    startingAfter = page.has_more
      ? page.data[page.data.length - 1]?.id
      : undefined;
  } while (startingAfter);

  return subscriptions;
}

export async function syncCheckoutSessionBilling(
  supabase: SupabaseClient,
  stripe: StripeCheckoutLike,
  userId: string,
  sessionId: string
) {
  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ['subscription'],
  });
  const sessionUserId =
    session.client_reference_id
    ?? (typeof session.metadata?.user_id === 'string' ? session.metadata.user_id : null);

  if (sessionUserId !== userId || session.mode !== 'subscription') {
    return null;
  }

  const monthlyPriceId = requireMonthlyStripePriceId();
  const stripeCustomerId = stripeObjectId(session.customer);
  if (stripeCustomerId) {
    await upsertBillingCustomer(
      supabase,
      userId,
      stripeCustomerId,
      session.customer_details?.email ?? session.customer_email ?? null
    );
  }

  const subscriptionId = stripeObjectId(session.subscription);
  if (!subscriptionId) {
    const entitlement = await refreshBillingEntitlement(supabase, userId);
    return { userId, stripeCustomerId, entitlement };
  }

  const subscription = await retrieveSubscription(stripe, subscriptionId);
  if (!subscriptionHasConfiguredMonthlyPrice(subscription, monthlyPriceId)) {
    console.warn('[billing] checkout subscription does not include configured monthly price', {
      subscriptionId: subscription.id,
    });
    return null;
  }

  const event = {
    id: `checkout.session.sync:${session.id}`,
    created: Math.floor(Date.now() / 1000),
  };
  const payload = await persistLiveStripeSubscription(
    supabase,
    subscription,
    userId,
    event,
    monthlyPriceId
  );

  if (!payload) {
    return null;
  }

  const entitlement = computeEntitlementForSubscriptions([payload]);
  await upsertBillingEntitlement(supabase, userId, entitlement);
  return { userId, stripeCustomerId: payload.stripe_customer_id, entitlement };
}

export async function syncBillingCustomerFromStripe(
  supabase: SupabaseClient,
  stripe: StripeLike,
  userId: string,
  options: BillingCustomerSyncOptions = {}
) {
  let stripeCustomerId =
    options.stripeCustomerId === undefined ? null : options.stripeCustomerId;

  if (stripeCustomerId === null) {
    const { data: customer, error } = await supabase
      .from('billing_customers')
      .select('stripe_customer_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to load billing customer: ${error.message}`);
    }

    stripeCustomerId = typeof customer?.stripe_customer_id === 'string'
      ? customer.stripe_customer_id
      : null;
  }

  if (!stripeCustomerId) {
    return null;
  }

  const monthlyPriceId = requireMonthlyStripePriceId();
  const subscriptions = await listCustomerSubscriptions(stripe, stripeCustomerId);
  const eventCreated = Math.floor((options.now ?? new Date()).getTime() / 1000);
  const syncedSubscriptions: BillingSubscriptionProjection[] = [];
  const syncedSubscriptionIds = new Set<string>();

  for (const listedSubscription of subscriptions) {
    const subscription = await retrieveSubscription(stripe, listedSubscription.id);

    if (!subscriptionHasConfiguredMonthlyPrice(subscription, monthlyPriceId)) {
      continue;
    }

    const event = {
      id: `billing.customer.sync:${subscription.id}:${eventCreated}`,
      created: eventCreated,
    };
    const payload = await persistLiveStripeSubscription(
      supabase,
      subscription,
      userId,
      event,
      monthlyPriceId
    );

    if (payload) {
      syncedSubscriptions.push(payload);
      syncedSubscriptionIds.add(payload.subscription_id);
    }
  }

  syncedSubscriptions.push(
    ...(await cancelStaleMonthlySubscriptions(
      supabase,
      userId,
      monthlyPriceId,
      syncedSubscriptionIds,
      eventCreated
    ))
  );

  const entitlement = syncedSubscriptions.length > 0
    ? computeEntitlementForSubscriptions(syncedSubscriptions)
    : getFreeBillingEntitlement();

  await upsertBillingEntitlement(supabase, userId, entitlement);

  return { userId, stripeCustomerId, entitlement };
}

function getInvoiceSubscriptionId(invoice: Stripe.Invoice) {
  const rawInvoice = invoice as unknown as {
    subscription?: unknown;
    parent?: { subscription_details?: { subscription?: unknown } };
  };

  return (
    stripeObjectId(rawInvoice.subscription)
    ?? stripeObjectId(rawInvoice.parent?.subscription_details?.subscription)
  );
}

function getInvoicePaymentIntentStatus(invoice: Stripe.Invoice) {
  const rawInvoice = invoice as unknown as {
    payment_intent?: string | { status?: string } | null;
  };

  if (
    rawInvoice.payment_intent
    && typeof rawInvoice.payment_intent === 'object'
    && typeof rawInvoice.payment_intent.status === 'string'
  ) {
    return rawInvoice.payment_intent.status;
  }

  return null;
}

export async function processStripeEvent(
  event: Stripe.Event,
  stripe: StripeLike,
  supabase: SupabaseClient
) {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId =
        session.client_reference_id
        ?? (typeof session.metadata?.user_id === 'string' ? session.metadata.user_id : null);
      const stripeCustomerId = stripeObjectId(session.customer);

      if (userId && stripeCustomerId) {
        await upsertBillingCustomer(
          supabase,
          userId,
          stripeCustomerId,
          session.customer_details?.email ?? session.customer_email ?? null
        );
      }

      const subscriptionId = stripeObjectId(session.subscription);
      if (subscriptionId) {
        const subscription = await retrieveSubscription(stripe, subscriptionId);
        await persistStripeSubscription(supabase, subscription, event);
      } else if (userId) {
        await refreshBillingEntitlement(supabase, userId);
      }
      return;
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      await persistStripeSubscription(
        supabase,
        event.data.object as Stripe.Subscription,
        event
      );
      return;
    }

    case 'invoice.payment_succeeded':
    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = getInvoiceSubscriptionId(invoice);
      if (!subscriptionId) {
        return;
      }

      const subscription = await retrieveSubscription(stripe, subscriptionId);
      await persistStripeSubscription(
        supabase,
        subscription,
        event,
        event.type === 'invoice.payment_failed' ? 'payment_failed' : 'payment_succeeded',
        getInvoicePaymentIntentStatus(invoice)
      );
      return;
    }

    default:
      return;
  }
}

export async function markWebhookEventProcessing(
  supabase: SupabaseClient,
  event: Stripe.Event
) {
  const { error } = await supabase
    .from('billing_webhook_events')
    .insert({
      event_id: event.id,
      type: event.type,
      stripe_created: unixToIso(event.created),
      processing_status: 'processing',
    });

  if (!error) {
    return true;
  }

  if (error.code === '23505') {
    const { data, error: lookupError } = await supabase
      .from('billing_webhook_events')
      .select('processing_status')
      .eq('event_id', event.id)
      .maybeSingle();

    if (lookupError) {
      throw new Error(`Failed to inspect duplicate webhook event: ${lookupError.message}`);
    }

    if (data?.processing_status === 'failed') {
      const { error: retryError } = await supabase
        .from('billing_webhook_events')
        .update({
          processing_status: 'processing',
          error: null,
          processed_at: null,
        })
        .eq('event_id', event.id);

      if (retryError) {
        throw new Error(`Failed to mark webhook event for retry: ${retryError.message}`);
      }

      return true;
    }

    return false;
  }

  throw new Error(`Failed to record webhook event: ${error.message}`);
}

export async function markWebhookEventProcessed(
  supabase: SupabaseClient,
  eventId: string,
  status: 'processed' | 'failed' | 'skipped',
  errorMessage?: string
) {
  const { error } = await supabase
    .from('billing_webhook_events')
    .update({
      processing_status: status,
      processed_at: new Date().toISOString(),
      error: errorMessage ?? null,
    })
    .eq('event_id', eventId);

  if (error) {
    console.error('[stripe] failed to update webhook event status', error);
  }
}

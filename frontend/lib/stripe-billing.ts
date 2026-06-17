import type Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  computeEntitlementFromSubscription,
  type BillingSubscriptionProjection,
} from '@/lib/billing';
import { PAID_MONTHLY_PLAN_KEY } from '@/lib/billing-config';

type StripeLike = Pick<Stripe, 'subscriptions'>;
type StripeCheckoutLike = Pick<Stripe, 'checkout' | 'subscriptions'>;

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

function getSubscriptionPriceId(subscription: Stripe.Subscription) {
  return subscription.items.data[0]?.price?.id ?? null;
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
  const { error } = await supabase
    .from('billing_customers')
    .upsert(
      {
        user_id: userId,
        stripe_customer_id: stripeCustomerId,
        email: email ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );

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

function buildSubscriptionPayload(
  subscription: Stripe.Subscription,
  stripeCustomerId: string,
  userId: string,
  event: Pick<Stripe.Event, 'id' | 'created'>,
  latestInvoiceStatus?: string | null,
  latestPaymentIntentStatus?: string | null
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
    price_id: getSubscriptionPriceId(subscription),
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

  const subscriptions = sortSubscriptionsForEntitlement(
    (data ?? []) as BillingSubscriptionProjection[]
  );
  const activeSubscription =
    subscriptions.find(
      (subscription) =>
        computeEntitlementFromSubscription(subscription).planKey === PAID_MONTHLY_PLAN_KEY
    )
    ?? subscriptions[0]
    ?? null;
  const entitlement = computeEntitlementFromSubscription(activeSubscription);

  const { error: upsertError } = await supabase
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

  if (upsertError) {
    throw new Error(`Failed to upsert billing entitlement: ${upsertError.message}`);
  }

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

  await refreshBillingEntitlement(supabase, userId);
  return userId;
}

async function retrieveSubscription(stripe: StripeLike, subscriptionId: string) {
  return stripe.subscriptions.retrieve(subscriptionId, {
    expand: ['latest_invoice.payment_intent'],
  });
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
    await refreshBillingEntitlement(supabase, userId);
    return userId;
  }

  const subscription = await retrieveSubscription(stripe, subscriptionId);
  await persistStripeSubscription(
    supabase,
    subscription,
    {
      id: `checkout.session.sync:${session.id}`,
      created: Math.floor(Date.now() / 1000),
    }
  );

  return userId;
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

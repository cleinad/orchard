import type { SupabaseClient } from '@supabase/supabase-js';
import {
  BILLING_LIMITS,
  FREE_PLAN_KEY,
  PAID_MONTHLY_PLAN_KEY,
  type BillingPlanKey,
  isMonthlyStripePrice,
} from '@/lib/billing-config';

export type BillingSubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'unpaid'
  | 'canceled'
  | 'incomplete'
  | 'incomplete_expired'
  | 'paused'
  | 'none';

export type BillingDisplayState =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'canceling_at_period_end'
  | 'payment_failed'
  | 'no_subscription'
  | 'incomplete'
  | 'incomplete_expired'
  | 'paused'
  | 'unpaid';

export interface BillingSubscriptionProjection {
  subscription_id: string | null;
  price_id: string | null;
  status: BillingSubscriptionStatus | string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
  cancel_at?: string | null;
  latest_invoice_status?: string | null;
  last_stripe_event_created?: string | null;
}

export interface BillingEntitlementProjection {
  plan_key: string | null;
  can_use_cloud_models: boolean | null;
  monthly_limit: number | null;
  status: BillingSubscriptionStatus | string | null;
  subscription_id: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  display_state: BillingDisplayState | string | null;
  refreshed_at: string | null;
}

export interface BillingEntitlement {
  planKey: BillingPlanKey;
  canUseCloudModels: boolean;
  monthlyLimit: number;
  status: BillingSubscriptionStatus;
  subscriptionId: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  displayState: BillingDisplayState;
  refreshedAt: string | null;
}

export interface UsageSummary {
  periodStart: string;
  periodEnd: string;
  used: number;
  limit: number;
}

const ACTIVE_ACCESS_STATUSES = new Set(['active', 'trialing']);

export function getCurrentUsagePeriod(now = new Date()) {
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  return {
    periodStart: periodStart.toISOString().slice(0, 10),
    periodEnd: periodEnd.toISOString().slice(0, 10),
  };
}

export function getFreeBillingEntitlement(): BillingEntitlement {
  return {
    planKey: FREE_PLAN_KEY,
    canUseCloudModels: false,
    monthlyLimit: BILLING_LIMITS[FREE_PLAN_KEY],
    status: 'none',
    subscriptionId: null,
    currentPeriodStart: null,
    currentPeriodEnd: null,
    displayState: 'no_subscription',
    refreshedAt: null,
  };
}

function isFutureDate(isoDate: string | null | undefined, now = new Date()) {
  if (!isoDate) {
    return false;
  }

  const date = new Date(isoDate);
  return Number.isFinite(date.getTime()) && date.getTime() > now.getTime();
}

export function getBillingDisplayState(
  subscription: BillingSubscriptionProjection | null,
  now = new Date()
): BillingDisplayState {
  if (!subscription?.subscription_id || !subscription.status) {
    return 'no_subscription';
  }

  if (subscription.latest_invoice_status === 'payment_failed') {
    return 'payment_failed';
  }

  if (
    (subscription.cancel_at_period_end || isFutureDate(subscription.cancel_at, now))
    && ACTIVE_ACCESS_STATUSES.has(subscription.status)
  ) {
    return 'canceling_at_period_end';
  }

  switch (subscription.status) {
    case 'active':
    case 'trialing':
    case 'past_due':
    case 'unpaid':
    case 'canceled':
    case 'incomplete':
    case 'incomplete_expired':
    case 'paused':
      return subscription.status;
    default:
      return 'no_subscription';
  }
}

export function computeEntitlementFromSubscription(
  subscription: BillingSubscriptionProjection | null,
  now = new Date()
): BillingEntitlement {
  const freeEntitlement = getFreeBillingEntitlement();

  if (!subscription?.subscription_id || !subscription.status) {
    return freeEntitlement;
  }

  const hasPaidPrice = isMonthlyStripePrice(subscription.price_id);
  const hasAccessStatus = ACTIVE_ACCESS_STATUSES.has(subscription.status);
  const withinCurrentPeriod = isFutureDate(subscription.current_period_end, now);
  const isPaid = hasPaidPrice && hasAccessStatus && withinCurrentPeriod;
  const displayState = getBillingDisplayState(subscription, now);

  if (!isPaid) {
    return {
      ...freeEntitlement,
      status: subscription.status as BillingSubscriptionStatus,
      subscriptionId: subscription.subscription_id,
      currentPeriodStart: subscription.current_period_start,
      currentPeriodEnd: subscription.current_period_end,
      displayState,
    };
  }

  return {
    planKey: PAID_MONTHLY_PLAN_KEY,
    canUseCloudModels: true,
    monthlyLimit: BILLING_LIMITS[PAID_MONTHLY_PLAN_KEY],
    status: subscription.status as BillingSubscriptionStatus,
    subscriptionId: subscription.subscription_id,
    currentPeriodStart: subscription.current_period_start,
    currentPeriodEnd: subscription.current_period_end,
    displayState,
    refreshedAt: null,
  };
}

function normalizeDisplayState(value: BillingEntitlementProjection['display_state']) {
  switch (value) {
    case 'active':
    case 'trialing':
    case 'past_due':
    case 'canceled':
    case 'canceling_at_period_end':
    case 'payment_failed':
    case 'no_subscription':
    case 'incomplete':
    case 'incomplete_expired':
    case 'paused':
    case 'unpaid':
      return value;
    default:
      return 'no_subscription';
  }
}

export function computeEntitlementFromProjection(
  projection: BillingEntitlementProjection | null,
  now = new Date()
): BillingEntitlement {
  const freeEntitlement = getFreeBillingEntitlement();

  if (!projection) {
    return freeEntitlement;
  }

  const displayState = normalizeDisplayState(projection.display_state);
  const status = projection.status as BillingSubscriptionStatus;
  const hasPaidAccess =
    projection.plan_key === PAID_MONTHLY_PLAN_KEY
    && projection.can_use_cloud_models === true
    && ACTIVE_ACCESS_STATUSES.has(projection.status ?? '')
    && isFutureDate(projection.current_period_end, now);

  if (!hasPaidAccess) {
    return {
      ...freeEntitlement,
      status: projection.status ? status : 'none',
      subscriptionId: projection.subscription_id,
      currentPeriodStart: projection.current_period_start,
      currentPeriodEnd: projection.current_period_end,
      displayState,
      refreshedAt: projection.refreshed_at,
    };
  }

  return {
    planKey: PAID_MONTHLY_PLAN_KEY,
    canUseCloudModels: true,
    monthlyLimit: BILLING_LIMITS[PAID_MONTHLY_PLAN_KEY],
    status,
    subscriptionId: projection.subscription_id,
    currentPeriodStart: projection.current_period_start,
    currentPeriodEnd: projection.current_period_end,
    displayState,
    refreshedAt: projection.refreshed_at,
  };
}

export async function getBillingEntitlement(
  supabase: SupabaseClient,
  userId: string
): Promise<BillingEntitlement> {
  const { data, error } = await supabase
    .from('billing_entitlements')
    .select(
      'plan_key, can_use_cloud_models, monthly_limit, status, subscription_id, current_period_start, current_period_end, display_state, refreshed_at'
    )
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('[billing] failed to load entitlement projection', error);
    return getFreeBillingEntitlement();
  }

  return computeEntitlementFromProjection(data as BillingEntitlementProjection | null);
}

export async function getUsageSummary(
  supabase: SupabaseClient,
  userId: string,
  entitlement: BillingEntitlement
): Promise<UsageSummary> {
  const { periodStart, periodEnd } = getCurrentUsagePeriod();
  const { data, error } = await supabase
    .from('usage_counters')
    .select('count')
    .eq('user_id', userId)
    .eq('feature_key', 'chat_message')
    .eq('period_start', periodStart)
    .maybeSingle();

  if (error) {
    console.error('[billing] failed to load usage counter', error);
  }

  return {
    periodStart,
    periodEnd,
    used: typeof data?.count === 'number' ? data.count : 0,
    limit: entitlement.monthlyLimit,
  };
}

export async function consumeChatUsage(
  supabase: SupabaseClient,
  userId: string,
  entitlement: BillingEntitlement
): Promise<{ allowed: boolean; usage: UsageSummary }> {
  const { periodStart, periodEnd } = getCurrentUsagePeriod();
  const { data, error } = await supabase.rpc('consume_model_usage', {
    p_user_id: userId,
    p_feature_key: 'chat_message',
    p_period_start: periodStart,
    p_period_end: periodEnd,
    p_increment: 1,
    p_limit: entitlement.monthlyLimit,
  });

  if (error) {
    console.error('[billing] failed to consume usage', error);
    return {
      allowed: false,
      usage: {
        periodStart,
        periodEnd,
        used: entitlement.monthlyLimit,
        limit: entitlement.monthlyLimit,
      },
    };
  }

  const result = Array.isArray(data) ? data[0] : data;
  const used = typeof result?.used_count === 'number' ? result.used_count : 0;

  return {
    allowed: Boolean(result?.allowed),
    usage: {
      periodStart,
      periodEnd,
      used,
      limit: entitlement.monthlyLimit,
    },
  };
}

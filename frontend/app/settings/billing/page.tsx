import { redirect } from 'next/navigation';
import {
  getBillingEntitlement,
  getUsageSummary,
  type BillingEntitlement,
} from '@/lib/billing';
import {
  type BillingSyncResult,
  syncBillingCustomerFromStripe,
  syncCheckoutSessionBilling,
} from '@/lib/stripe-billing';
import { getStripe } from '@/lib/stripe';
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from '@/lib/supabase-server';
import { BillingActions } from './BillingActions';

interface BillingPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

type BillingCustomer = { stripe_customer_id: string | null } | null;

export const dynamic = 'force-dynamic';

const STATE_LABELS: Record<string, string> = {
  active: 'Active',
  trialing: 'Trialing',
  past_due: 'Past due',
  canceled: 'Canceled',
  canceling_at_period_end: 'Canceling at period end',
  payment_failed: 'Payment failed',
  no_subscription: 'No subscription',
  incomplete: 'Incomplete',
  incomplete_expired: 'Incomplete expired',
  paused: 'Paused',
  unpaid: 'Unpaid',
};

function formatDate(value: string | null) {
  if (!value) {
    return 'Not available';
  }

  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}

function getCheckoutState(
  searchParams: Record<string, string | string[] | undefined>
) {
  const checkout = searchParams.checkout;
  return Array.isArray(checkout) ? checkout[0] : checkout;
}

function getSessionId(
  searchParams: Record<string, string | string[] | undefined>
) {
  const sessionId = searchParams.session_id;
  return Array.isArray(sessionId) ? sessionId[0] : sessionId;
}

async function getBillingCustomer(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string
): Promise<BillingCustomer> {
  const { data } = await supabase
    .from('billing_customers')
    .select('stripe_customer_id')
    .eq('user_id', userId)
    .maybeSingle();

  return data;
}

function applyStripeResult(
  result: BillingSyncResult | null,
  fallbackCustomer: BillingCustomer
) {
  if (!result) {
    return null;
  }

  return {
    entitlement: result.entitlement,
    customer: {
      stripe_customer_id:
        result.stripeCustomerId ?? fallbackCustomer?.stripe_customer_id ?? null,
    },
  };
}

async function resolveBillingPageState({
  checkoutSessionId,
  checkoutState,
  entitlement,
  customer,
  userId,
}: {
  checkoutSessionId?: string;
  checkoutState?: string;
  entitlement: BillingEntitlement;
  customer: BillingCustomer;
  userId: string;
}) {
  let resolvedEntitlement = entitlement;
  let resolvedCustomer = customer;
  let stripeCustomerId = customer?.stripe_customer_id ?? null;
  const hasCheckoutSession = checkoutState === 'success' && Boolean(checkoutSessionId);
  let serviceRoleSupabase: ReturnType<typeof createSupabaseServiceRoleClient> | null = null;
  let stripe: ReturnType<typeof getStripe> | null = null;

  function getServiceRoleSupabase() {
    serviceRoleSupabase ??= createSupabaseServiceRoleClient();
    return serviceRoleSupabase;
  }

  function getStripeClient() {
    stripe ??= getStripe();
    return stripe;
  }

  if (hasCheckoutSession && checkoutSessionId) {
    try {
      const checkoutResult = applyStripeResult(
        await syncCheckoutSessionBilling(
          getServiceRoleSupabase(),
          getStripeClient(),
          userId,
          checkoutSessionId
        ),
        resolvedCustomer
      );

      if (checkoutResult) {
        resolvedEntitlement = checkoutResult.entitlement;
        resolvedCustomer = checkoutResult.customer;
        stripeCustomerId = checkoutResult.customer.stripe_customer_id;
      }
    } catch (error) {
      console.error('[billing] checkout return sync failed', error);
    }
  }

  if (stripeCustomerId) {
    try {
      const customerResult = applyStripeResult(
        await syncBillingCustomerFromStripe(
          getServiceRoleSupabase(),
          getStripeClient(),
          userId,
          { stripeCustomerId }
        ),
        resolvedCustomer
      );

      if (customerResult) {
        resolvedEntitlement = customerResult.entitlement;
        resolvedCustomer = customerResult.customer;
      }
    } catch (error) {
      console.error('[billing] customer sync failed', error);
    }
  }

  return {
    entitlement: resolvedEntitlement,
    customer: resolvedCustomer,
  };
}

function BillingRow({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="grid gap-3 px-4 py-3.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {hint ? (
          <p className="mt-0.5 text-sm leading-relaxed text-muted">{hint}</p>
        ) : null}
      </div>

      <span className="text-left text-sm text-foreground/90 sm:max-w-[18rem] sm:text-right">
        {value}
      </span>
    </div>
  );
}

export default async function BillingPage({ searchParams }: BillingPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect('/login?redirect=/settings/billing');
  }

  const dbEntitlement = await getBillingEntitlement(supabase, user.id);
  const checkoutState = getCheckoutState(resolvedSearchParams);
  const checkoutSessionId = getSessionId(resolvedSearchParams);
  const dbCustomer = await getBillingCustomer(supabase, user.id);
  const { entitlement, customer } = await resolveBillingPageState({
    checkoutSessionId,
    checkoutState,
    entitlement: dbEntitlement,
    customer: dbCustomer,
    userId: user.id,
  });
  const usage = await getUsageSummary(supabase, user.id, entitlement);
  const isSyncingAfterCheckout =
    checkoutState === 'success' && !entitlement.canUseCloudModels;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-8 font-sans">
      {checkoutState === 'success' ? (
        <div className="rounded-xl border border-border-subtle bg-surface/60 px-4 py-3 text-sm text-foreground">
          {isSyncingAfterCheckout
            ? 'Checkout succeeded. Syncing subscription status.'
            : 'Checkout succeeded. Your subscription is active.'}
        </div>
      ) : null}

      {checkoutState === 'canceled' ? (
        <div className="rounded-xl border border-border-subtle bg-surface/60 px-4 py-3 text-sm text-muted">
          Checkout was canceled. Your plan has not changed.
        </div>
      ) : null}

      <section aria-labelledby="settings-billing-heading" className="scroll-mt-24">
        <h2
          id="settings-billing-heading"
          className="font-heading text-lg text-foreground"
        >
          Billing
        </h2>
        <div className="mt-3 divide-y divide-border-subtle overflow-hidden rounded-xl border border-border-subtle bg-surface/60">
          <BillingRow
            label="Current plan"
            value={entitlement.canUseCloudModels
              ? entitlement.planKey === 'keen_pro'
                ? 'Pro plan'
                : 'Plus plan'
              : 'Free'}
          />
          <BillingRow
            label="Subscription state"
            value={STATE_LABELS[entitlement.displayState] ?? 'No subscription'}
          />
          <BillingRow
            label="Current billing period"
            value={`${formatDate(entitlement.currentPeriodStart)} - ${formatDate(
              entitlement.currentPeriodEnd
            )}`}
          />
          <BillingRow
            label="Monthly usage backstop"
            value={`${usage.used} / ${usage.limit}`}
            hint="Counts accepted chat messages before model calls are made."
          />
          <div className="px-4 py-3.5">
            <BillingActions
              canManageBilling={Boolean(customer?.stripe_customer_id)}
              canUpgrade={!entitlement.canUseCloudModels}
            />
          </div>
        </div>
      </section>
    </div>
  );
}

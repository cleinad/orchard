import { NextResponse } from 'next/server';
import { getBillingEntitlement } from '@/lib/billing';
import { getAppUrl, getStripe } from '@/lib/stripe';
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from '@/lib/supabase-server';

function checkoutIdempotencyWindow(now = Date.now()) {
  return Math.floor(now / 60_000);
}

export async function POST() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const priceId = process.env.STRIPE_PRICE_MONTHLY_ID;
    if (!priceId) {
      return NextResponse.json(
        { error: 'Stripe monthly price is not configured' },
        { status: 500 }
      );
    }

    const entitlement = await getBillingEntitlement(supabase, user.id);
    if (entitlement.canUseCloudModels) {
      return NextResponse.json(
        { error: 'Subscription is already active' },
        { status: 409 }
      );
    }

    const admin = createSupabaseServiceRoleClient();
    const stripe = getStripe();
    const appUrl = getAppUrl();

    const { data: existingCustomer, error: customerLookupError } = await admin
      .from('billing_customers')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (customerLookupError) {
      console.error('[billing] customer lookup failed', customerLookupError);
      return NextResponse.json(
        { error: 'Unable to start checkout' },
        { status: 500 }
      );
    }

    let stripeCustomerId =
      typeof existingCustomer?.stripe_customer_id === 'string'
        ? existingCustomer.stripe_customer_id
        : null;

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create(
        {
          email: user.email ?? undefined,
          metadata: { user_id: user.id },
        },
        { idempotencyKey: `customer:${user.id}` }
      );
      stripeCustomerId = customer.id;

      const { error: upsertError } = await admin
        .from('billing_customers')
        .upsert(
          {
            user_id: user.id,
            stripe_customer_id: stripeCustomerId,
            email: user.email ?? null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' }
        );

      if (upsertError) {
        console.error('[billing] customer upsert failed', upsertError);
        return NextResponse.json(
          { error: 'Unable to start checkout' },
          { status: 500 }
        );
      }
    }

    const subscriptions = await stripe.subscriptions.list({
      customer: stripeCustomerId,
      status: 'all',
      limit: 10,
    });
    const existingRecoverableSubscription = subscriptions.data.find(
      (subscription) =>
        ['active', 'trialing', 'past_due', 'unpaid', 'incomplete'].includes(
          subscription.status
        )
        && subscription.items.data.some((item) => item.price.id === priceId)
    );

    if (existingRecoverableSubscription) {
      return NextResponse.json(
        { error: 'Subscription already exists. Open billing to manage it.' },
        { status: 409 }
      );
    }

    const openSessions = await stripe.checkout.sessions.list({
      customer: stripeCustomerId,
      status: 'open',
      limit: 10,
    });
    const existingOpenSession = openSessions.data.find(
      (session) =>
        session.mode === 'subscription'
        && session.url
        && (
          session.client_reference_id === user.id
          || session.metadata?.user_id === user.id
        )
    );

    if (existingOpenSession?.url) {
      return NextResponse.json({ url: existingOpenSession.url });
    }

    const session = await stripe.checkout.sessions.create(
      {
        mode: 'subscription',
        customer: stripeCustomerId,
        client_reference_id: user.id,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${appUrl}/settings/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appUrl}/settings/billing?checkout=canceled`,
        allow_promotion_codes: true,
        metadata: {
          user_id: user.id,
          price_id: priceId,
        },
        subscription_data: {
          metadata: {
            user_id: user.id,
            price_id: priceId,
          },
        },
      },
      {
        idempotencyKey: `checkout:${user.id}:${priceId}:${checkoutIdempotencyWindow()}`,
      }
    );

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('[billing] checkout route failed', error);
    return NextResponse.json(
      { error: 'Unable to start checkout' },
      { status: 500 }
    );
  }
}

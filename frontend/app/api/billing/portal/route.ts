import { NextResponse } from 'next/server';
import { getAppUrl, getStripe } from '@/lib/stripe';
import { createSupabaseServerClient } from '@/lib/supabase-server';

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

    const { data: customer, error: customerError } = await supabase
      .from('billing_customers')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (customerError) {
      console.error('[billing] customer lookup failed', customerError);
      return NextResponse.json(
        { error: 'Unable to open billing portal' },
        { status: 500 }
      );
    }

    if (!customer?.stripe_customer_id) {
      return NextResponse.json(
        { error: 'No billing customer found' },
        { status: 404 }
      );
    }

    const session = await getStripe().billingPortal.sessions.create({
      customer: customer.stripe_customer_id,
      return_url: `${getAppUrl()}/settings/billing`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('[billing] portal route failed', error);
    return NextResponse.json(
      { error: 'Unable to open billing portal' },
      { status: 500 }
    );
  }
}

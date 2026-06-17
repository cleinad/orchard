import { NextRequest, NextResponse } from 'next/server';
import {
  markWebhookEventProcessed,
  markWebhookEventProcessing,
  processStripeEvent,
} from '@/lib/stripe-billing';
import { getStripe } from '@/lib/stripe';
import { createSupabaseServiceRoleClient } from '@/lib/supabase-server';

export async function POST(request: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json(
      { error: 'Stripe webhook secret is not configured' },
      { status: 500 }
    );
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing Stripe signature' }, { status: 400 });
  }

  const stripe = getStripe();
  const rawBody = await request.text();
  let event;

  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (error) {
    console.error('[stripe] webhook signature verification failed', error);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let supabase: ReturnType<typeof createSupabaseServiceRoleClient>;
  try {
    supabase = createSupabaseServiceRoleClient();
    const shouldProcess = await markWebhookEventProcessing(supabase, event);
    if (!shouldProcess) {
      return NextResponse.json({ received: true, duplicate: true });
    }
  } catch (error) {
    console.error('[stripe] webhook setup failed', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }

  try {
    await processStripeEvent(event, stripe, supabase);
    await markWebhookEventProcessed(supabase, event.id, 'processed');
    return NextResponse.json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown webhook error';
    console.error('[stripe] webhook processing failed', error);
    await markWebhookEventProcessed(supabase, event.id, 'failed', message);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}

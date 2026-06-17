-- Track Stripe's scheduled cancellation timestamp. Stripe may set cancel_at
-- without setting cancel_at_period_end when a subscription remains active
-- until a future cancellation date.

alter table public.billing_subscriptions
  add column if not exists cancel_at timestamptz;

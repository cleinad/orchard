-- Forward migration for chat usage limits after 20260612120000_stripe_billing.sql
-- has already been applied.
--
-- This intentionally avoids dropping/recreating billing tables so existing Stripe
-- projections, entitlements, webhook logs, and usage counters are preserved.

begin;

alter table public.billing_entitlements
  alter column monthly_limit set default 250;

-- Existing deployments created usage_counters periods as date. The new 3-hour
-- rolling windows need timestamp precision. Treat existing date buckets as UTC
-- midnights so current monthly counters still line up with app-generated ISO
-- month boundaries.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'usage_counters'
      and column_name = 'period_start'
      and data_type = 'date'
  ) then
    alter table public.usage_counters
      alter column period_start type timestamptz
        using period_start::timestamp at time zone 'UTC',
      alter column period_end type timestamptz
        using period_end::timestamp at time zone 'UTC';
  end if;
end;
$$;

create or replace function public.consume_chat_usage_limits(
  p_user_id uuid,
  p_month_start timestamptz,
  p_month_end timestamptz,
  p_window_start timestamptz,
  p_window_end timestamptz,
  p_total_increment integer,
  p_premium_increment integer,
  p_monthly_total_limit integer,
  p_window_total_limit integer,
  p_monthly_premium_limit integer,
  p_window_premium_limit integer
)
returns table (
  allowed boolean,
  monthly_used_count integer,
  monthly_limit integer,
  window_used_count integer,
  window_limit integer,
  monthly_premium_used_count integer,
  monthly_premium_limit integer,
  window_premium_used_count integer,
  window_premium_limit integer,
  blocked_limit text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_monthly_total integer := 0;
  v_window_total integer := 0;
  v_monthly_premium integer := 0;
  v_window_premium integer := 0;
begin
  if auth.uid() is distinct from p_user_id and auth.role() <> 'service_role' then
    raise exception 'not allowed';
  end if;

  if p_total_increment <= 0
    or p_premium_increment < 0
    or p_monthly_total_limit < 0
    or p_window_total_limit < 0
    or p_monthly_premium_limit < 0
    or p_window_premium_limit < 0 then
    raise exception 'invalid usage arguments';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  select coalesce(count, 0) into v_monthly_total
    from public.usage_counters
    where user_id = p_user_id
      and feature_key = 'chat_total_monthly'
      and period_start = p_month_start
    for update;

  select coalesce(count, 0) into v_window_total
    from public.usage_counters
    where user_id = p_user_id
      and feature_key = 'chat_total_window'
      and period_start = p_window_start
    for update;

  select coalesce(count, 0) into v_monthly_premium
    from public.usage_counters
    where user_id = p_user_id
      and feature_key = 'chat_premium_units_monthly'
      and period_start = p_month_start
    for update;

  select coalesce(count, 0) into v_window_premium
    from public.usage_counters
    where user_id = p_user_id
      and feature_key = 'chat_premium_units_window'
      and period_start = p_window_start
    for update;

  v_monthly_total := coalesce(v_monthly_total, 0);
  v_window_total := coalesce(v_window_total, 0);
  v_monthly_premium := coalesce(v_monthly_premium, 0);
  v_window_premium := coalesce(v_window_premium, 0);

  if v_monthly_total + p_total_increment > p_monthly_total_limit then
    return query select false, v_monthly_total, p_monthly_total_limit, v_window_total, p_window_total_limit, v_monthly_premium, p_monthly_premium_limit, v_window_premium, p_window_premium_limit, 'monthly_total';
    return;
  end if;

  if v_window_total + p_total_increment > p_window_total_limit then
    return query select false, v_monthly_total, p_monthly_total_limit, v_window_total, p_window_total_limit, v_monthly_premium, p_monthly_premium_limit, v_window_premium, p_window_premium_limit, 'window_total';
    return;
  end if;

  if v_monthly_premium + p_premium_increment > p_monthly_premium_limit then
    return query select false, v_monthly_total, p_monthly_total_limit, v_window_total, p_window_total_limit, v_monthly_premium, p_monthly_premium_limit, v_window_premium, p_window_premium_limit, 'monthly_premium';
    return;
  end if;

  if v_window_premium + p_premium_increment > p_window_premium_limit then
    return query select false, v_monthly_total, p_monthly_total_limit, v_window_total, p_window_total_limit, v_monthly_premium, p_monthly_premium_limit, v_window_premium, p_window_premium_limit, 'window_premium';
    return;
  end if;

  insert into public.usage_counters (
    user_id,
    feature_key,
    period_start,
    period_end,
    count
  )
  values
    (p_user_id, 'chat_total_monthly', p_month_start, p_month_end, p_total_increment),
    (p_user_id, 'chat_total_window', p_window_start, p_window_end, p_total_increment),
    (p_user_id, 'chat_premium_units_monthly', p_month_start, p_month_end, p_premium_increment),
    (p_user_id, 'chat_premium_units_window', p_window_start, p_window_end, p_premium_increment)
  on conflict (user_id, feature_key, period_start) do update
    set count = public.usage_counters.count + excluded.count,
        period_end = excluded.period_end,
        updated_at = now();

  return query select true,
    v_monthly_total + p_total_increment,
    p_monthly_total_limit,
    v_window_total + p_total_increment,
    p_window_total_limit,
    v_monthly_premium + p_premium_increment,
    p_monthly_premium_limit,
    v_window_premium + p_premium_increment,
    p_window_premium_limit,
    null::text;
  return;
end;
$$;

revoke all on function public.consume_chat_usage_limits(uuid, timestamptz, timestamptz, timestamptz, timestamptz, integer, integer, integer, integer, integer, integer) from public;
grant execute on function public.consume_chat_usage_limits(uuid, timestamptz, timestamptz, timestamptz, timestamptz, integer, integer, integer, integer, integer, integer) to authenticated;
grant execute on function public.consume_chat_usage_limits(uuid, timestamptz, timestamptz, timestamptz, timestamptz, integer, integer, integer, integer, integer, integer) to service_role;

-- Replace the subscription upsert RPC so deployments that already ran the old
-- migration get the corrected column list and remain event-order-safe.
create or replace function public.upsert_billing_subscription_if_newer(
  p_subscription jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows integer;
begin
  insert into public.billing_subscriptions (
    subscription_id,
    stripe_customer_id,
    user_id,
    price_id,
    status,
    current_period_start,
    current_period_end,
    cancel_at_period_end,
    cancel_at,
    canceled_at,
    trial_end,
    latest_invoice_id,
    latest_invoice_status,
    latest_payment_intent_status,
    metadata,
    last_stripe_event_id,
    last_stripe_event_created,
    updated_at
  )
  values (
    p_subscription->>'subscription_id',
    p_subscription->>'stripe_customer_id',
    (p_subscription->>'user_id')::uuid,
    p_subscription->>'price_id',
    p_subscription->>'status',
    nullif(p_subscription->>'current_period_start', '')::timestamptz,
    nullif(p_subscription->>'current_period_end', '')::timestamptz,
    coalesce((p_subscription->>'cancel_at_period_end')::boolean, false),
    nullif(p_subscription->>'cancel_at', '')::timestamptz,
    nullif(p_subscription->>'canceled_at', '')::timestamptz,
    nullif(p_subscription->>'trial_end', '')::timestamptz,
    p_subscription->>'latest_invoice_id',
    p_subscription->>'latest_invoice_status',
    p_subscription->>'latest_payment_intent_status',
    coalesce(p_subscription->'metadata', '{}'::jsonb),
    p_subscription->>'last_stripe_event_id',
    nullif(p_subscription->>'last_stripe_event_created', '')::timestamptz,
    coalesce(nullif(p_subscription->>'updated_at', '')::timestamptz, now())
  )
  on conflict (subscription_id) do update
    set stripe_customer_id = excluded.stripe_customer_id,
        user_id = excluded.user_id,
        price_id = excluded.price_id,
        status = excluded.status,
        current_period_start = excluded.current_period_start,
        current_period_end = excluded.current_period_end,
        cancel_at_period_end = excluded.cancel_at_period_end,
        cancel_at = excluded.cancel_at,
        canceled_at = excluded.canceled_at,
        trial_end = excluded.trial_end,
        latest_invoice_id = excluded.latest_invoice_id,
        latest_invoice_status = excluded.latest_invoice_status,
        latest_payment_intent_status = excluded.latest_payment_intent_status,
        metadata = excluded.metadata,
        last_stripe_event_id = excluded.last_stripe_event_id,
        last_stripe_event_created = excluded.last_stripe_event_created,
        updated_at = excluded.updated_at
    where public.billing_subscriptions.last_stripe_event_created is null
      or excluded.last_stripe_event_created is null
      or public.billing_subscriptions.last_stripe_event_created < excluded.last_stripe_event_created
      or (
        public.billing_subscriptions.last_stripe_event_created = excluded.last_stripe_event_created
        and coalesce(public.billing_subscriptions.last_stripe_event_id, '') < coalesce(excluded.last_stripe_event_id, '')
      );

  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

revoke all on function public.upsert_billing_subscription_if_newer(jsonb) from public;
grant execute on function public.upsert_billing_subscription_if_newer(jsonb) to service_role;

commit;

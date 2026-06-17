-- Stripe billing projection and monthly chat usage limits.
--
-- This migration intentionally resets only the billing/usage objects below before
-- recreating them. It avoids conflicts with earlier partial billing-table attempts
-- whose columns may not match the schema this app expects.

drop function if exists public.consume_model_usage(uuid, text, date, date, integer, integer);

drop table if exists public.usage_counters cascade;
drop table if exists public.billing_webhook_events cascade;
drop table if exists public.billing_entitlements cascade;
drop table if exists public.billing_subscriptions cascade;
drop table if exists public.billing_customers cascade;

create table if not exists public.billing_customers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text not null unique,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_billing_customers_stripe_customer_id
  on public.billing_customers(stripe_customer_id);

create table if not exists public.billing_subscriptions (
  subscription_id text primary key,
  stripe_customer_id text not null references public.billing_customers(stripe_customer_id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  price_id text,
  status text not null,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  cancel_at timestamptz,
  canceled_at timestamptz,
  trial_end timestamptz,
  latest_invoice_id text,
  latest_invoice_status text,
  latest_payment_intent_status text,
  metadata jsonb not null default '{}'::jsonb,
  last_stripe_event_id text,
  last_stripe_event_created timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_billing_subscriptions_user_id
  on public.billing_subscriptions(user_id);

create index if not exists idx_billing_subscriptions_customer_id
  on public.billing_subscriptions(stripe_customer_id);

create index if not exists idx_billing_subscriptions_status_period
  on public.billing_subscriptions(user_id, status, current_period_end desc);

create table if not exists public.billing_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan_key text not null default 'free',
  can_use_cloud_models boolean not null default false,
  monthly_limit integer not null default 20,
  status text not null default 'none',
  subscription_id text references public.billing_subscriptions(subscription_id) on delete set null,
  current_period_start timestamptz,
  current_period_end timestamptz,
  display_state text not null default 'no_subscription',
  refreshed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.billing_webhook_events (
  event_id text primary key,
  type text not null,
  stripe_created timestamptz,
  processing_status text not null default 'processing'
    check (processing_status in ('processing', 'processed', 'failed', 'skipped')),
  error text,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_billing_webhook_events_status
  on public.billing_webhook_events(processing_status, created_at);

create table if not exists public.usage_counters (
  user_id uuid not null references auth.users(id) on delete cascade,
  feature_key text not null,
  period_start date not null,
  period_end date not null,
  count integer not null default 0 check (count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, feature_key, period_start)
);

create index if not exists idx_usage_counters_user_period
  on public.usage_counters(user_id, period_start desc);

alter table public.billing_customers enable row level security;
alter table public.billing_subscriptions enable row level security;
alter table public.billing_entitlements enable row level security;
alter table public.billing_webhook_events enable row level security;
alter table public.usage_counters enable row level security;

drop policy if exists "Users can read own billing customer" on public.billing_customers;
create policy "Users can read own billing customer"
  on public.billing_customers
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can read own billing subscriptions" on public.billing_subscriptions;
create policy "Users can read own billing subscriptions"
  on public.billing_subscriptions
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can read own billing entitlements" on public.billing_entitlements;
create policy "Users can read own billing entitlements"
  on public.billing_entitlements
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can read own usage counters" on public.usage_counters;
create policy "Users can read own usage counters"
  on public.usage_counters
  for select
  to authenticated
  using (auth.uid() = user_id);

create or replace function public.consume_model_usage(
  p_user_id uuid,
  p_feature_key text,
  p_period_start date,
  p_period_end date,
  p_increment integer,
  p_limit integer
)
returns table (
  allowed boolean,
  used_count integer,
  monthly_limit integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if auth.uid() is distinct from p_user_id and auth.role() <> 'service_role' then
    raise exception 'not allowed';
  end if;

  if p_increment <= 0 or p_limit < 0 then
    raise exception 'invalid usage arguments';
  end if;

  loop
    update public.usage_counters
      set count = count + p_increment,
          period_end = p_period_end,
          updated_at = now()
      where user_id = p_user_id
        and feature_key = p_feature_key
        and period_start = p_period_start
        and count + p_increment <= p_limit
      returning count into v_count;

    if found then
      return query select true, v_count, p_limit;
      return;
    end if;

    select count into v_count
      from public.usage_counters
      where user_id = p_user_id
        and feature_key = p_feature_key
        and period_start = p_period_start;

    if found then
      return query select false, v_count, p_limit;
      return;
    end if;

    begin
      insert into public.usage_counters (
        user_id,
        feature_key,
        period_start,
        period_end,
        count
      )
      values (
        p_user_id,
        p_feature_key,
        p_period_start,
        p_period_end,
        p_increment
      )
      returning count into v_count;

      return query select true, v_count, p_limit;
      return;
    exception when unique_violation then
      -- Retry; another request created the row concurrently.
    end;
  end loop;
end;
$$;

revoke all on function public.consume_model_usage(uuid, text, date, date, integer, integer) from public;
grant execute on function public.consume_model_usage(uuid, text, date, date, integer, integer) to authenticated;
grant execute on function public.consume_model_usage(uuid, text, date, date, integer, integer) to service_role;

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

drop trigger if exists on_billing_customer_updated on public.billing_customers;
create trigger on_billing_customer_updated
  before update on public.billing_customers
  for each row execute function public.handle_updated_at();

drop trigger if exists on_billing_subscription_updated on public.billing_subscriptions;
create trigger on_billing_subscription_updated
  before update on public.billing_subscriptions
  for each row execute function public.handle_updated_at();

drop trigger if exists on_billing_entitlement_updated on public.billing_entitlements;
create trigger on_billing_entitlement_updated
  before update on public.billing_entitlements
  for each row execute function public.handle_updated_at();

drop trigger if exists on_usage_counter_updated on public.usage_counters;
create trigger on_usage_counter_updated
  before update on public.usage_counters
  for each row execute function public.handle_updated_at();

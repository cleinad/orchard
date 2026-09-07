-- Remove billing and quota objects accidentally captured by the production
-- schema baseline. Orchard never shipped the corresponding application paths.

begin;

drop function if exists public.consume_chat_usage_limits(
  uuid,
  timestamp with time zone,
  timestamp with time zone,
  timestamp with time zone,
  timestamp with time zone,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer
) restrict;
drop function if exists public.consume_model_usage(
  uuid,
  text,
  date,
  date,
  integer,
  integer
) restrict;
drop function if exists public.handle_billing_updated_at() restrict;
drop function if exists
  public.upsert_billing_subscription_if_newer(jsonb)
  restrict;

drop table if exists public.billing_entitlements restrict;
drop table if exists public.billing_subscriptions restrict;
drop table if exists public.billing_customers restrict;
drop table if exists public.billing_webhook_events restrict;
drop table if exists public.chat_usage_events restrict;
drop table if exists public.usage_counters restrict;

commit;

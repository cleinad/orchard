revoke all
on function public.upsert_billing_subscription_if_newer(jsonb)
from public, anon, authenticated;

grant execute
on function public.upsert_billing_subscription_if_newer(jsonb)
to service_role;

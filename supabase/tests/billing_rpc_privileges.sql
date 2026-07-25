begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(3);

select ok(
  not has_function_privilege(
    'anon',
    'public.upsert_billing_subscription_if_newer(jsonb)',
    'EXECUTE'
  ),
  'anonymous users cannot execute the billing subscription upsert'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.upsert_billing_subscription_if_newer(jsonb)',
    'EXECUTE'
  ),
  'authenticated users cannot execute the billing subscription upsert'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.upsert_billing_subscription_if_newer(jsonb)',
    'EXECUTE'
  ),
  'the service role can execute the billing subscription upsert'
);

select * from finish();

rollback;

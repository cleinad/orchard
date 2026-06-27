# Stripe Billing Smoke Testing

Use this when Stripe Dashboard settings change, before launch, or when you want
end-to-end confidence that the hosted Stripe flow and local webhook listener are
working together.

For daily development, prefer the deterministic billing tests in
[README.md](./README.md). Those tests do not open Stripe Checkout or the Customer
Portal.

## Billing Page Sync Expectations

`/settings/billing` reconciles against live Stripe state whenever it has a
Checkout `session_id` or a mapped Stripe customer id. The db billing projection
is still the durable fallback for webhooks, app-wide gates, and Stripe outages.

Expected behavior:

- A successful Checkout return should render the paid monthly plan without a
  manual refresh, even if the webhook has not arrived yet.
- Returning from the Customer Portal after canceling at period end should render
  `Canceling at period end` without a manual refresh.
- If Stripe reports an immediately canceled or expired subscription, the page
  should render free access without requiring an extra refresh.
- If live Stripe retrieval fails, the page should preserve the current db
  projection instead of downgrading the user.

## Manual Smoke Checklist

Prerequisites:

- Supabase billing migration has been applied.
- `.env.local` in `frontend/` contains:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `STRIPE_SECRET_KEY`
  - `STRIPE_PRICE_MONTHLY_ID`
  - `STRIPE_WEBHOOK_SECRET`
  - `NEXT_PUBLIC_APP_URL=http://localhost:3000`
- Stripe Dashboard has:
  - one monthly recurring test-mode price matching `STRIPE_PRICE_MONTHLY_ID`
  - Customer Portal enabled
  - webhook events selected for the billing lifecycle

Start the app:

```bash
cd frontend
npm run dev
```

In a second terminal, start local Stripe webhook forwarding:

```bash
cd frontend
set -a; source .env.local; set +a
STRIPE_API_KEY="$STRIPE_SECRET_KEY" stripe listen \
  --forward-to localhost:3000/api/stripe/webhook \
  --events checkout.session.completed,customer.subscription.created,customer.subscription.updated,customer.subscription.deleted,invoice.payment_succeeded,invoice.payment_failed
```

Copy the printed `whsec_...` into `STRIPE_WEBHOOK_SECRET`, restart Next, and
leave the Stripe listener running.

Checklist:

1. Sign in to the app with a test user.
2. Open `/settings`.
3. Click the Billing row and confirm `/settings/billing` loads.
4. Confirm the page shows:
   - `Current plan: Free`
   - `Subscription state: No subscription`
   - an Upgrade button
5. Click Upgrade.
6. Confirm the app redirects to Stripe Checkout.
7. Complete Checkout with Stripe test card `4242 4242 4242 4242`, any future
   expiry, any CVC, and any billing ZIP/postal code.
8. Confirm Checkout returns to `/settings/billing?checkout=success...`.
9. Without manually refreshing, confirm the page shows:
   - `Current plan: Plus plan`
   - `Subscription state: Active`
   - a Manage billing button
10. Confirm the Stripe listener printed the relevant webhook events.
11. Select a paid/latest model and confirm the app allows it for the paid user.
12. Click Manage billing.
13. Confirm the app redirects to the Stripe Customer Portal.
14. Cancel the subscription in the portal.
15. Return to `/settings/billing` and, without manually refreshing, confirm:
   - `Current plan: Plus plan`
   - `Subscription state: Canceling at period end`
16. Optionally use Stripe Dashboard or CLI to cancel immediately, force a
   failed-payment, or delete the subscription. Reopen `/settings/billing` and,
   without an extra refresh, confirm the app renders the corresponding free or
   payment-failed state.

After the smoke test, clean up the test customer/subscription in Stripe test mode
if needed.

## Semi-Automated Smoke Script Shape

A smoke script can verify the parts that do not require a human completing
Stripe-hosted Checkout:

- Stripe API credentials work.
- The configured monthly price exists.
- A Checkout Session can be created in test mode.
- A signed webhook payload reaches the local route.
- Supabase entitlement projection updates.

Expected command:

```bash
cd frontend
npm run test:stripe-smoke
```

The script would:

1. Load `.env.local`.
2. Assert `STRIPE_SECRET_KEY`, `STRIPE_PRICE_MONTHLY_ID`, `NEXT_PUBLIC_APP_URL`,
   and Supabase server credentials are present.
3. Use the Stripe API to retrieve `STRIPE_PRICE_MONTHLY_ID` and confirm it is a
   recurring test-mode price.
4. Create a test-mode Checkout Session with the configured price and assert the
   returned URL points at Stripe Checkout.
5. Generate a signed local webhook payload and POST it to
   `{NEXT_PUBLIC_APP_URL}/api/stripe/webhook`.
6. Poll Supabase for the expected `billing_customers`,
   `billing_subscriptions`, `billing_entitlements`, and
   `billing_webhook_events` rows.

Limitations:

- It still requires the app to be running locally.
- If testing real Stripe webhook delivery locally, the Stripe CLI listener must
  also be running.
- It does not prove that a user can complete hosted Checkout in a browser.
- It does not prove Customer Portal Dashboard configuration.

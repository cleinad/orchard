This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

### Project Docs

- Auth and route protection: [`../docs/features/auth-and-route-protection.md`](../docs/features/auth-and-route-protection.md)

### Environment Setup

1. Create a `.env.local` file in the `frontend` directory with your Supabase credentials:

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

You can find these values in your Supabase project settings: https://app.supabase.com/project/_/settings/api

2. Add the Stripe Billing variables:

```bash
STRIPE_SECRET_KEY=sk_test_or_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_MONTHLY_ID=price_...
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Keep `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `SUPABASE_SERVICE_ROLE_KEY` server-only. Do not prefix them with `NEXT_PUBLIC_`.

### Stripe Dashboard Setup

1. Create a product for Keen's monthly plan.
2. Create one recurring monthly price and copy its price ID into `STRIPE_PRICE_MONTHLY_ID`.
3. Configure the Customer Portal for subscription cancellation, payment method updates, and invoice history.
4. Add a webhook endpoint for:

```text
{NEXT_PUBLIC_APP_URL}/api/stripe/webhook
```

5. Subscribe the endpoint to these events:

```text
checkout.session.completed
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
invoice.payment_succeeded
invoice.payment_failed
```

### Local Stripe Testing

Install and log in to the Stripe CLI, then forward webhook events to the local app:

```bash
stripe login
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Copy the printed `whsec_...` value into `STRIPE_WEBHOOK_SECRET`. Use Stripe's test cards through `/settings/billing`, or trigger events from the CLI:

```bash
stripe trigger checkout.session.completed
stripe trigger customer.subscription.updated
stripe trigger invoice.payment_failed
```

Run the Supabase migration in `../supabase/migrations/20260612120000_stripe_billing.sql` before testing billing routes.

### Billing Reconciliation Model

The db billing tables are the durable projection used by app-wide model access,
usage limits, and webhook processing. Stripe is treated as the live authority on
`/settings/billing` when the page has a lookup path:

- a successful Checkout return with `session_id`
- an existing `billing_customers.stripe_customer_id`

On those visits, the page retrieves Stripe state, persists the latest customer,
subscription, and entitlement projection, and renders from the fresh Stripe
result. If Stripe cannot be reached, the page falls back to the current db
projection and does not downgrade paid access just because live sync failed.

Canceled users usually still have a Stripe customer and historical subscription,
so `/settings/billing` should continue to reconcile them with
`status: all` subscription lookups. A period-end cancellation should render paid
access with `Canceling at period end`; an immediately canceled or expired
subscription should render free access once Stripe returns the canceled state.

### Automated Stripe Billing Tests

Most billing regressions should be caught without clicking through Stripe Checkout or the Customer Portal. Run the deterministic billing canary from `frontend/`:

```bash
npm test -- --run \
  __tests__/app/billing-routes.test.ts \
  __tests__/app/stripe-webhook-route.test.ts \
  __tests__/app/chat-models-route-billing.test.ts \
  __tests__/app/chat-route-billing.test.ts \
  __tests__/app/settings-billing-page.test.ts \
  __tests__/app/settings-billing-link.test.ts \
  __tests__/lib/billing.test.ts \
  __tests__/lib/stripe-billing.test.ts
npx tsc --noEmit
```

For the full testing index and when to run this suite, see [`../docs/testing/README.md`](../docs/testing/README.md). For the manual hosted Stripe smoke checklist, see [`../docs/testing/stripe-billing-smoke.md`](../docs/testing/stripe-billing-smoke.md).

### Running the Development Server

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

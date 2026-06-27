# Testing

This is the central testing entrypoint for Keen.

Start here if you need to know:

- what automated tests exist
- which test runner to use
- how to run the full suite vs a focused canary
- which deeper testing doc to read for a specific feature area

## Current Test Surface

- Automated tests currently live in `frontend/`.
- The app uses two runners: Vitest and Playwright.

## Test Runners

### Vitest

Vitest covers automated unit, integration, route-handler, and proxy tests.

- Test files: `frontend/__tests__/**/*.test.ts`
- Config: `frontend/vitest.config.ts`

Run from `frontend/`:

```bash
npm test
npm run test:watch
npx vitest run __tests__/path/to/file.test.ts
```

### Playwright

Playwright covers browser-level tests, including fixture-driven flows and request-mocked route/navigation coverage.

- Test files: `frontend/e2e/**/*.spec.js`
- Config: `frontend/playwright.config.js`

Run from `frontend/`:

```bash
npm run test:e2e
npm run test:e2e:ui
npx playwright test e2e/home-routing.spec.js
npx playwright test e2e/inline-threads.spec.js
npx playwright test e2e/persistent-inline-threads.spec.js
```

Notes:

- the Playwright config starts the Next dev server on `127.0.0.1:3005`
- Playwright enables `KEEN_E2E_BYPASS_AUTH=1` for `/home`-prefixed routes that include an `e2e` query param

## Test Inventory

### Vitest App, Route, And Server Coverage

- `frontend/__tests__/app/chat-route.test.ts`: `/api/chat` contract coverage, including memory loading, memory writes, and route-level orchestration
- `frontend/__tests__/app/chat-route-search.test.ts`: explicit search-mode orchestration, v2 `search_metadata` persistence, invalid citation stripping, and clean memory handoff
- `frontend/__tests__/app/billing-routes.test.ts`: Stripe Checkout and Customer Portal route contracts without opening Stripe UI
- `frontend/__tests__/app/stripe-webhook-route.test.ts`: signed Stripe webhook POST handling, signature failures, event persistence, and duplicate delivery behavior
- `frontend/__tests__/app/chat-models-route-billing.test.ts`: billing entitlement projection in the chat model list route
- `frontend/__tests__/app/chat-route-billing.test.ts`: server-side paid-model and usage-limit enforcement before model calls
- `frontend/__tests__/app/settings-billing-page.test.ts`: `/settings/billing` plan, subscription state, usage, checkout-return rendering, live Stripe reconciliation, and db fallback behavior
- `frontend/__tests__/app/settings-billing-link.test.ts`: settings navigation to `/settings/billing`
- `frontend/__tests__/app/conversations-route.test.ts`: conversation creation, mentor ownership validation, request validation, and empty-conversation cleanup
- `frontend/__tests__/app/deepgram-token-route.test.ts`: `/api/deepgram/token` auth, env validation, and Deepgram token response handling
- `frontend/__tests__/app/home/conversation-map-model.test.ts`: pure conversation-map projection, route patching, active-path positioning, and zoom-stable node presence
- `frontend/__tests__/app/memory-items-routes.test.ts`: memory item CRUD auth, scope filters, normalization, and embedding side effects
- `frontend/__tests__/app/tts-route.test.ts`: `/api/tts` auth and request/config validation
- `frontend/__tests__/proxy.test.ts`: page auth protection, login redirects, and the fixture-only E2E bypass guardrails

### Vitest Library Coverage

- `frontend/__tests__/lib/auth-redirect.test.ts`: safe post-login redirect sanitization
- `frontend/__tests__/lib/billing.test.ts`: billing entitlement computation, display-state mapping, projection safety, and usage periods
- `frontend/__tests__/lib/chat-models.test.ts`: static chat model catalog validation
- `frontend/__tests__/lib/models.test.ts`: model resolution, provider availability, and fallback behavior
- `frontend/__tests__/lib/memory-items.test.ts`: deterministic memory normalization and scoring helpers
- `frontend/__tests__/lib/memory-integration.test.ts`: memory read/write integration behavior with mocked externals
- `frontend/__tests__/lib/search-citations.test.ts`: persisted source normalization, citation splitting, and citation-marker stripping helpers
- `frontend/__tests__/lib/search-telemetry.test.ts`: structured search logging redaction and event payload rules
- `frontend/__tests__/lib/search-router.test.ts`: deterministic query classification for freshness, research, official-priority, and social intent
- `frontend/__tests__/lib/search-pipeline.test.ts`: provider orchestration, fallback, dedupe, and authority-aware reranking
- `frontend/__tests__/lib/stripe-billing.test.ts`: Stripe subscription/webhook projection, live customer reconciliation, idempotency, stale-event handling, and invoice transitions

### Playwright Browser Coverage

- `frontend/e2e/conversation-map.spec.js`: split-pane map behavior, branch-route activation, transcript scroll sync, stable node layout, zoom, resize, mobile takeover, and map/thread interaction boundaries
- `frontend/e2e/home-routing.spec.js`: direct `/home/[conversationId]` hydration, sidebar route changes, draft promotion, and URL-less temporary-chat transitions
- `frontend/e2e/inline-threads.spec.js`: inline-thread creation, selection, popover behavior, and keyboard handoff flow
- `frontend/e2e/persistent-inline-threads.spec.js`: persisted inline-thread reopen behavior and durable offset-based rendering cases
- `frontend/e2e/search-mode.spec.js`: explicit search toggle requests and scalable reply-attached source tray behavior

## Focused Canaries

Use the smallest relevant suite first.

### Memory

- Doc: [memory.md](./memory.md)
- Run:

```bash
cd frontend
npm test -- __tests__/app/chat-route.test.ts __tests__/app/memory-items-routes.test.ts __tests__/lib/memory-items.test.ts __tests__/lib/memory-integration.test.ts
```

### Auth And Route Protection

- Doc: [../features/auth-and-route-protection.md](../features/auth-and-route-protection.md)
- Run:

```bash
cd frontend
npm test -- __tests__/lib/auth-redirect.test.ts __tests__/proxy.test.ts __tests__/app/tts-route.test.ts
```

### Chat Model Selection

- Doc: [chat-model-selection.md](./chat-model-selection.md)
- Run:

```bash
cd frontend
npx vitest run __tests__/lib/chat-models.test.ts __tests__/lib/models.test.ts
```

### Stripe Billing

- Smoke doc: [stripe-billing-smoke.md](./stripe-billing-smoke.md)
- Run the fast deterministic billing suite:

```bash
cd frontend
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

This suite is deterministic and does not open Stripe Checkout or the Customer Portal. It signs webhook fixtures with a test secret, mocks Stripe/db calls, and verifies billing projections, duplicate webhook handling, checkout/portal contracts, `/settings/billing` live Stripe reconciliation with db fallback, and server-side model/usage enforcement.

For hosted Checkout, Customer Portal, real Stripe credentials, and local Stripe
CLI forwarding, use the manual smoke checklist in
[stripe-billing-smoke.md](./stripe-billing-smoke.md).

### Inline Threads

- Doc: [inline-threads-e2e.md](./inline-threads-e2e.md)
- Run:

```bash
cd frontend
npx playwright test e2e/inline-threads.spec.js e2e/persistent-inline-threads.spec.js
```

### Home Routing

- Doc: [home-routing-e2e.md](./home-routing-e2e.md)
- Run:

```bash
cd frontend
npx playwright test e2e/home-routing.spec.js
```

Manual sanity check:
from `/home/<conversationId>`, create or select a temporary chat and confirm the app lands on `/home` with the temporary chat selected on the first click.

### Conversation Map

- Doc: [../features/conversation-branching.md](../features/conversation-branching.md)
- Run:

```bash
cd frontend
npx playwright test e2e/conversation-map.spec.js
```

### Search Mode And Citations

- Doc: [search-citations-and-source-ui.md](./search-citations-and-source-ui.md)
- Run:

```bash
cd frontend
npm run test -- __tests__/app/chat-route.test.ts __tests__/app/chat-route-search.test.ts __tests__/lib/search-citations.test.ts __tests__/lib/search-router.test.ts __tests__/lib/search-pipeline.test.ts
npm run test -- __tests__/lib/search-telemetry.test.ts
npm run test:e2e -- e2e/search-mode.spec.js
```

## Which Tests To Run

- If you change memory loading, memory writing, memory CRUD, or mentor memory scoping, run the memory canary suite.
- If you change proxy logic, login redirect handling, protected-route behavior, or TTS auth, run the auth canary suite.
- If you change model catalog data, provider resolution, or chat model selection UI behavior, run the model-selection tests.
- If you change Stripe billing routes, webhook processing, entitlement computation, usage limits, paid-model gating, or `/settings/billing`, run the Stripe Billing canary.
- If you change conversation-map layout, branch-route activation, transcript/map scroll sync, map resize behavior, or mobile map takeover behavior, run the conversation-map Playwright suite.
- If you change home route hydration, routed loading UI, sidebar-driven chat navigation, draft promotion, or temporary chat route behavior, run the home-routing Playwright suite and manually verify the first-click `/home/<conversationId>` to temporary-chat handoff.
- If you change inline threads, selection handling, markdown rendering, or thread panel behavior, run the inline-thread Playwright suite.
- If you change Search mode routing, provider normalization, citation persistence, markdown citation chips, or the source tray UI, run the search canary suite.
- If you make broad frontend changes and are unsure, run `npm test` and then `npm run test:e2e` from `frontend/`.

## Detailed Testing Docs

- [home-routing-e2e.md](./home-routing-e2e.md): routed home-chat browser coverage, mocks, and regression targets including delayed hydration UI
- [inline-threads-e2e.md](./inline-threads-e2e.md): browser fixtures, mocks, and regression targets for inline threads
- [search-citations-and-source-ui.md](./search-citations-and-source-ui.md): search-mode citation test scope, focused canary, manual checks, and current gaps
- [stripe-billing-smoke.md](./stripe-billing-smoke.md): manual hosted Stripe smoke checklist and semi-automated smoke-script outline
- [search-tuning-playbook.md](./search-tuning-playbook.md): manual live-provider tuning workflow using real API keys and structured search telemetry
- [memory.md](./memory.md): memory canary suite map, rationale, and remaining gaps
- [chat-model-selection.md](./chat-model-selection.md): automated and manual verification for model selection
- [../features/auth-and-route-protection.md](../features/auth-and-route-protection.md): auth/proxy testing coverage and focused command

## For Coding Agents

When you change behavior in a tested area:

- read this file first
- run the smallest relevant canary before broader suites
- update the closest testing doc if you add a new test file, change runner commands, or change the intended verification scope

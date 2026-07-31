# Testing

Automated tests live under `frontend/` and use Vitest for unit, integration, and
route coverage, plus Playwright for browser behavior.

## Full checks

Run from `frontend/`:

```bash
npm test
npx tsc --noEmit
npm run lint
npm run build
npm run test:e2e
```

Use the checks proportional to the change. A broad frontend or persistence
change should run the full set.

## Vitest

Tests: `frontend/__tests__/**/*.test.ts`

Config: `frontend/vitest.config.ts`

```bash
npm test
npm run test:watch
npx vitest run __tests__/lib/response-style.test.ts
```

Major groups:

- `__tests__/app/` — API routes, proxy behavior, and home runtime helpers
- `__tests__/lib/` — models, search, Markdown, and chat-run logic
- `__tests__/supabase/` — static migration and database-contract checks

Route tests use mocked Supabase and provider boundaries. They do not prove that
a live deployment, RLS policy, or external provider is configured correctly.

## Playwright

Tests: `frontend/e2e/**/*.spec.js`

Config: `frontend/playwright.config.js`

```bash
npm run test:e2e
npm run test:e2e:ui
npx playwright test e2e/inline-threads.spec.js
```

The config starts a development server on `127.0.0.1:3005` unless
`PLAYWRIGHT_NO_WEB_SERVER` is set. Browser fixtures use a narrowly scoped page
auth bypass and mocked application requests; API authorization still has
separate Vitest coverage.

When `PLAYWRIGHT_NO_WEB_SERVER` is set, provide an authenticated Playwright
storage-state file through `PLAYWRIGHT_AUTH_STORAGE_STATE`. Managed runs use a
local Auth fixture by default; custom `NEXT_PUBLIC_SUPABASE_URL` runs also
require an authenticated storage-state file.

Current browser suites:

- `home-routing.spec.js` — routed hydration, sidebar navigation, drafts, and
  temporary-chat handoffs
- `inline-threads.spec.js` — selection, popover, panel, and temporary threads
- `persistent-inline-threads.spec.js` — persistence, offset anchors, Markdown,
  code, math, and tables
- `conversation-map.spec.js` — branching and map navigation
- `chat-run-lifecycle.spec.js` — execution, navigation, cancellation, and
  reconciliation
- `search-mode.spec.js` — search controls, citations, and source tray
- `workspaces.spec.js` — workspaces, moves, deletion, and uploads

## Focused checks

### Inline threads and Markdown

```bash
npx playwright test \
  e2e/inline-threads.spec.js \
  e2e/persistent-inline-threads.spec.js
```

### Branching and conversation map

```bash
npm test -- __tests__/app/home/conversation-map-model.test.ts
npx playwright test e2e/conversation-map.spec.js
```

### Home routing and chat runs

```bash
npm test -- \
  __tests__/app/home/home-runtime-helpers.test.ts \
  __tests__/app/home/useMainChatRuntime.test.ts \
  __tests__/lib/chat-run-protocol.test.ts \
  __tests__/lib/chat-run-reconciliation.test.ts
npx playwright test e2e/home-routing.spec.js e2e/chat-run-lifecycle.spec.js
```

### Search

```bash
npm test -- \
  __tests__/app/chat-route-search.test.ts \
  __tests__/lib/search-citations.test.ts \
  __tests__/lib/search-orchestrator.test.ts \
  __tests__/lib/search-pipeline.test.ts \
  __tests__/lib/search-query-planner.test.ts \
  __tests__/lib/search-router.test.ts \
  __tests__/lib/search-telemetry.test.ts
npx playwright test e2e/search-mode.spec.js
```

Use the [Search tuning playbook](./search-tuning-playbook.md) for real provider
traffic.

### Workspaces

```bash
npm test -- \
  __tests__/app/workspaces-route.test.ts \
  __tests__/supabase/workspaces-migration.test.ts
npx playwright test e2e/workspaces.spec.js
```

### Models and response style

```bash
npm test -- \
  __tests__/lib/chat-models.test.ts \
  __tests__/lib/models.test.ts \
  __tests__/lib/response-style.test.ts \
  __tests__/app/home/usePerChatComposerState.test.ts
```

### Authentication

```bash
npm test -- __tests__/lib/auth-redirect.test.ts __tests__/proxy.test.ts
```

### Usage telemetry and administration

```bash
npm test -- \
  __tests__/lib/model-usage.test.ts \
  __tests__/lib/model-pricing.test.ts \
  __tests__/lib/telemetry-server.test.ts \
  __tests__/lib/telemetry-deferred.test.ts \
  __tests__/app/admin-dashboard.test.ts \
  __tests__/app/admin-page.test.ts \
  __tests__/lib/admin-authorization.test.ts \
  __tests__/lib/admin-usage.test.ts \
  __tests__/supabase/model-usage-migration.test.ts \
  __tests__/supabase/model-usage-grants-migration.test.ts
npx playwright test e2e/admin-access.spec.js
```

These suites cover normalization and pricing, every instrumented model-call
surface, best-effort write failure, aggregate mapping, unknown-versus-zero
semantics, admin authorization, and the migration contract. The executable
database suite remains required for grants, RLS, constraints, and real aggregate
behavior.

## Database checks

`supabase/tests/database.sql` and `supabase/tests/billing_rpc_privileges.sql`
exercise database invariants against a compatible disposable environment.

Do not run destructive reset commands against a durable environment. Follow the
repository guidance for database setup, migrations, Auth, Storage, and live
database verification.

## Choosing coverage

- Start with the feature's focused tests.
- Add adjacent suites when a shared runtime, schema, route, or renderer changed.
- Run `npm test`, typecheck, lint, and build before handing off a broad change.
- Run the full Playwright suite when navigation, shared chat state, Markdown
  rendering, or cross-feature coordination changed.
- Report checks that were not run.

## Related docs

- [Documentation map](../README.md)
- [Inline-thread rendering](../implementation/inline-thread-rendering.md)
- [Chat run lifecycle](../features/chat-run-lifecycle.md)
- [Search tuning playbook](./search-tuning-playbook.md)

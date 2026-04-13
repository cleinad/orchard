# Testing

This is the central testing entrypoint for Keen.

Start here if you need to know:

- what automated tests exist
- which test runner to use
- how to run the full suite vs a focused canary
- which deeper testing doc to read for a specific feature area

Suite-specific testing docs currently live in both `docs/testing/` and `docs/tests/` for historical reasons. Use this file as the index instead of browsing those folders directly.

## Current Test Surface

- Automated tests currently live in `frontend/`.
- The repo currently has no backend automated tests.
- The frontend uses two runners: Vitest and Playwright.

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

### Vitest Route And Server Coverage

- `frontend/__tests__/app/chat-route.test.ts`: `/api/chat` contract coverage, including memory loading, memory writes, and route-level orchestration
- `frontend/__tests__/app/memory-items-routes.test.ts`: memory item CRUD auth, scope filters, normalization, and embedding side effects
- `frontend/__tests__/app/tts-route.test.ts`: `/api/tts` auth and request/config validation
- `frontend/__tests__/proxy.test.ts`: page auth protection, login redirects, and the fixture-only E2E bypass guardrails

### Vitest Library Coverage

- `frontend/__tests__/lib/auth-redirect.test.ts`: safe post-login redirect sanitization
- `frontend/__tests__/lib/chat-models.test.ts`: static chat model catalog validation
- `frontend/__tests__/lib/models.test.ts`: model resolution, provider availability, and fallback behavior
- `frontend/__tests__/lib/memory-items.test.ts`: deterministic memory normalization and scoring helpers
- `frontend/__tests__/lib/memory-integration.test.ts`: memory read/write integration behavior with mocked externals

### Playwright Browser Coverage

- `frontend/e2e/home-routing.spec.js`: direct `/home/[conversationId]` hydration, sidebar route changes, draft promotion, and URL-less temporary-chat transitions
- `frontend/e2e/inline-threads.spec.js`: inline-thread creation, selection, popover behavior, and keyboard handoff flow
- `frontend/e2e/persistent-inline-threads.spec.js`: persisted inline-thread reopen behavior and durable offset-based rendering cases

## Focused Canaries

Use the smallest relevant suite first.

### Memory

- Doc: [../tests/memory-tests.md](../tests/memory-tests.md)
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

- Doc: [../tests/chat-model-selection-tests.md](../tests/chat-model-selection-tests.md)
- Run:

```bash
cd frontend
npx vitest run __tests__/lib/chat-models.test.ts __tests__/lib/models.test.ts
```

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

## Which Tests To Run

- If you change memory loading, memory writing, memory CRUD, or mentor memory scoping, run the memory canary suite.
- If you change proxy logic, login redirect handling, protected-route behavior, or TTS auth, run the auth canary suite.
- If you change model catalog data, provider resolution, or chat model selection UI behavior, run the model-selection tests.
- If you change home route hydration, sidebar-driven chat navigation, draft promotion, or temporary chat route behavior, run the home-routing Playwright suite.
- If you change inline threads, selection handling, markdown rendering, or thread panel behavior, run the inline-thread Playwright suite.
- If you make broad frontend changes and are unsure, run `npm test` and then `npm run test:e2e` from `frontend/`.

## Detailed Testing Docs

- [home-routing-e2e.md](./home-routing-e2e.md): routed home-chat browser coverage, mocks, and regression targets
- [inline-threads-e2e.md](./inline-threads-e2e.md): browser fixtures, mocks, and regression targets for inline threads
- [../tests/memory-tests.md](../tests/memory-tests.md): memory canary suite map, rationale, and remaining gaps
- [../tests/chat-model-selection-tests.md](../tests/chat-model-selection-tests.md): automated and manual verification for model selection
- [../features/auth-and-route-protection.md](../features/auth-and-route-protection.md): auth/proxy testing coverage and focused command

## For Coding Agents

When you change behavior in a tested area:

- read this file first
- run the smallest relevant canary before broader suites
- update the closest testing doc if you add a new test file, change runner commands, or change the intended verification scope

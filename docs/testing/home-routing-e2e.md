# Home Routing E2E

For the overall test inventory, runner commands, and canary map, start with [README.md](./README.md).

This doc describes the Playwright coverage for the routed home-chat flows on `/home` and `/home/[conversationId]`.

## What It Covers

- direct entry to `/home/[conversationId]`
- delayed route hydration on `/home/[conversationId]`
- sidebar selection of persistent conversations
- draft promotion from `/home` into `/home/[conversationId]`
- temporary-chat transitions back to `/home`
- non-persistent selection handoff when leaving `/home/[conversationId]`

## How To Run

From `frontend/`:

- `npm run test:e2e`
- `npm run test:e2e:ui`
- `npx playwright test e2e/home-routing.spec.js`

The Playwright config starts the Next dev server on `127.0.0.1:3005`.

## Mocking Strategy

These tests do not use the inline-thread fixture mode. Instead, they run the normal home page with request-level mocks for the data sources the routed UI depends on.

The browser tests mock:

- `GET /api/chat/models`
- `GET /api/mentors`
- `POST /api/chat`
- Supabase browser auth `GET /auth/v1/user`
- Supabase browser data reads for `conversations`, `messages`, `threads`, and `profiles`

That keeps the suite focused on frontend behavior:

- route-driven conversation hydration
- browser URL changes
- draft and temporary selection flow
- client-side handoff between routed and URL-less home states

## E2E Routing Harness

Playwright enters protected home routes with `?e2e=...` so the proxy can bypass auth in the dedicated test environment.

For routed-home coverage, the app now preserves that `e2e` query across internal home navigations during the test run. That behavior exists only to keep the browser suite inside the protected home surface while it exercises:

- `/home`
- `/home/[conversationId]`
- transitions between persistent and URL-less chat states

This should be treated as test harness behavior, not product behavior.

## Key Regression Cases

The suite now guards against:

- direct `/home/[conversationId]` loads rendering the blank state instead of hydrating messages
- direct `/home/[conversationId]` loads flashing the large empty-chat hero while routed message history is still loading
- sidebar conversation clicks changing selection without updating the URL
- first draft sends creating a persistent conversation without replacing the route
- temporary chats dropping the active selection when moving off `/home/[conversationId]`

## Intentional Gaps

The suite does not currently cover:

- browser back/forward history assertions
- mentor deep-link handling from `/home?mentor=...`
- real Supabase integration
- real authenticated sessions without the E2E bypass

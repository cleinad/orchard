# Inline Threads E2E

This doc describes the Playwright coverage for the inline-thread workflow on `/home`.

## What It Covers

- text selection inside assistant messages
- persistent selection highlighting
- popover-to-thread-panel promotion with `Ctrl+L`
- draft, loading, and completed handoff states
- persisted thread reopen behavior from the source message

## How To Run

From `frontend/`:

- `npm run test:e2e`
- `npm run test:e2e:ui`

The Playwright config starts the Next dev server on `127.0.0.1:3005`.

## Fixture Mode

The tests use deterministic home-page fixtures instead of relying on live sidebar or Supabase data.

Fixture URLs:

- `/home?e2e=inline-threads`
- `/home?e2e=inline-threads-persistent`

These fixtures:

- seed a known assistant message
- keep the chat state deterministic
- skip live sidebar bootstrap
- bypass the `/home` auth proxy only when the Playwright server env enables it

Playwright enables learning mode through `localStorage` before navigation.

## Mocking Strategy

The browser tests mock:

- `POST /api/chat`
- `GET /api/threads/:threadId/messages`

That keeps the tests focused on frontend behavior:

- selection state
- keyboard shortcuts
- popover lifecycle
- thread panel rendering

## Intentional Gaps

The suite does not currently cover:

- pixel-level popover placement
- non-Chromium browsers
- live Supabase integration
- full end-to-end persistence through the real backend

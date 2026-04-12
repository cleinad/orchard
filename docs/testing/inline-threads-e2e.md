# Inline Threads E2E

For the overall test inventory, runner commands, and canary map, start with [README.md](./README.md).

This doc describes the Playwright coverage for the inline-thread workflow on `/home`.

## What It Covers

- text selection inside assistant messages
- persistent selection highlighting
- popover-to-thread-panel promotion with `Ctrl+L`
- draft, loading, and completed handoff states
- persisted thread reopen behavior from the source message
- offset-based durable inline thread rendering for tricky content shapes

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
- `/home?e2e=inline-threads-ordered-list`
- `/home?e2e=inline-threads-repeated-text`
- `/home?e2e=inline-threads-bullet-list`

These fixtures:

- seed a known assistant message
- keep the chat state deterministic
- skip live sidebar bootstrap
- bypass the normal page-auth proxy for `/home` fixture URLs only when the Playwright server env enables it

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
- durable inline-thread rendering from persisted offsets

## Key Regression Cases

The persistent fixture coverage now includes:

- ordered-list selections where the visible highlighted text includes a marker such as `3.`
- repeated-text selections where offsets must target the correct occurrence
- bullet-list selections where the visible prefix is not safe to recover by substring matching

These cases exist specifically to guard against regressions in chat-display and markdown-rendering changes. If inline thread rendering changes, this suite should be rerun before shipping.

## Intentional Gaps

The suite does not currently cover:

- pixel-level popover placement
- non-Chromium browsers
- live Supabase integration
- full end-to-end persistence through the real backend
- real auth redirect behavior

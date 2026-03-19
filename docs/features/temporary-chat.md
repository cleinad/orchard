# Temporary Chat

## Overview

Temporary chat is an incognito-style chat mode on the home screen.

- The user can toggle temporary mode from the header.
- In temporary mode, the chat is **not saved**.
- Temporary threads are also **not saved**.
- The user can choose between:
  - `use_existing`: existing memories may be used for context, but nothing from the session is retained
  - `off`: no memory is read and no memory is written

This is intentionally a true no-persistence mode. It does **not** create rows and then clean them up later.

## User-Facing Behavior

- Header shows a dedicated temporary-chat toggle, a `Temporary` badge, and a second badge for the active temporary memory mode while the mode is active.
- A fresh temporary session shows a larger onboarding card in the composer explaining that the conversation will not be saved.
- The user chooses the memory mode at the start of the temporary session.
- After the first submitted message, the temporary intro card disappears entirely and the chosen memory mode remains fixed for that session.
- Switching between persistent and temporary mode clears the current session.
- Temporary chats do not appear in the sidebar.
- Refreshing or leaving the page drops the temporary session.

## Why It Works This Way

The persistent chat system is backed by Supabase tables (`conversations`, `messages`, `threads`) and the memory pipeline writes new memory asynchronously after each response.

For temporary chat, “write then delete” would have been the wrong model because:

- it breaks the promise if cleanup fails
- it complicates sidebar/history filtering
- it creates avoidable persistence risk

Instead, temporary chat is handled as:

- **server-side generation with optional memory read**
- **client-side conversation state**
- **client-side thread state**
- **zero database writes**

## Architecture

### Shared Session Types

`frontend/lib/chat-session.ts`

Introduces shared types/constants used by both client and server:

- `ChatMode = 'persistent' | 'temporary'`
- `TemporaryMemoryMode = 'use_existing' | 'off'`
- `ChatHistoryMessage`
- `toChatHistory()`
- `createTemporaryId()`

This is the contract that lets the client send temporary history to `/api/chat` without pretending that a real conversation or thread exists in the database.

### Home Page State

`frontend/app/home/page.tsx`

This is the main orchestration point.

It now manages two parallel modes:

- **persistent mode**
  - uses existing `useHomeData()` state
  - loads/saves conversations and messages normally
- **temporary mode**
  - keeps `temporaryMessages` in React state
  - keeps `temporaryThreadsMap` in React state
  - keeps `temporaryThreadMessages` in React state

Important behavior in this file:

- toggling temporary mode resets the current chat UI and starts clean
- persistent sidebar selection forces `chatMode='persistent'`
- `activeMessages`, `activeThreadsMap`, and `activeConversationId` are derived from the current mode
- the large temporary intro card is only shown when `activeMessages.length === 0`

### Header / Composer UI

- `frontend/app/home/components/HomeHeader.tsx`
- `frontend/app/home/components/ChatComposer.tsx`

Header:

- adds the temporary toggle beside the marketplace button
- shows a `Temporary` badge near the active name
- shows a second badge for the active temporary memory mode (`Uses memories` or `No memory`)

Composer:

- shows the larger temporary intro card for a brand-new temporary session
- does not show persistent per-message memory controls after the first submitted message
- exposes the `use_existing` / `off` toggle

### Temporary Threads

- `frontend/app/home/components/TextSelectionPopover.tsx`
- `frontend/app/home/components/ThreadPanel.tsx`

Persistent threads already existed and were DB-backed.

Temporary threads intentionally do **not** touch the `threads` table.

Instead:

- thread ids are client-generated with `createTemporaryId('thread')`
- thread message ids are client-generated with `createTemporaryId('message')`
- thread metadata lives in `temporaryThreadsMap`
- thread message history lives in `temporaryThreadMessages`

The popover and thread panel still call `/api/chat`, but in temporary mode they send:

- `chatMode`
- `memoryMode`
- main conversation `history`
- thread-specific `threadHistory`

That gives the server enough context to answer, while keeping the source of truth local to the browser session.

## Chat API Behavior

`frontend/app/api/chat/route.ts`

The chat route now supports both persistent and temporary execution paths.

### Persistent Path

Current behavior is preserved:

- validate/create conversation
- create/validate thread when needed
- write user message
- load DB history
- read memory context
- generate reply
- write assistant message
- schedule `processMemoryV2()` in `after()`

### Temporary Path

Temporary requests send:

- `chatMode: 'temporary'`
- `memoryMode: 'use_existing' | 'off'`
- `history`
- optional `threadHistory`

The route then:

- authenticates the user normally
- optionally loads mentor config
- does **not** create or validate a conversation row
- does **not** create or validate a thread row
- does **not** write user or assistant messages
- does **not** call `processMemoryV2()`

Memory behavior:

- `use_existing`: load memory context with `loadMemoryContextV2()`
- `off`: skip memory loading entirely

Generation still uses the same prompt/search stack, so the model behavior remains close to normal chat.

## Key Files

| File | Role |
|------|------|
| `frontend/lib/chat-session.ts` | Shared temporary chat/session types and helpers |
| `frontend/app/home/page.tsx` | Main mode switch, temporary state, request payload construction |
| `frontend/app/home/components/HomeHeader.tsx` | Header toggle + `Temporary` badge |
| `frontend/app/home/components/ChatComposer.tsx` | Temporary intro card, compact post-first-message controls |
| `frontend/app/home/components/TextSelectionPopover.tsx` | Temporary thread creation via local ids + temporary history payloads |
| `frontend/app/home/components/ThreadPanel.tsx` | Temporary thread message handling and compact `Temporary` indicator |
| `frontend/app/api/chat/route.ts` | Persistent vs temporary branching, optional memory read, zero-write temporary path |

## Temporary Request Shape

In temporary mode, the client sends enough context for the server to answer without DB history:

```ts
{
  message: string,
  mentorId?: string,
  chatMode: 'temporary',
  memoryMode: 'use_existing' | 'off',
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  threadId?: string,
  threadHistory?: Array<{ role: 'user' | 'assistant'; content: string }>,
  sourceMessageId?: string,
  highlightedText?: string,
  concise?: boolean
}
```

The route sanitizes these arrays before using them.

## Limitations / Intentional Tradeoffs

- Temporary chats disappear on refresh/navigation.
- Temporary threads are session-local only.
- Temporary mode is not represented in the database at all.
- Existing ESLint setup in this repo was unable to run because `eslint-config-next/core-web-vitals` could not be resolved locally; TypeScript and tests were used for verification instead.

## Verification

Verified during implementation:

- `./node_modules/.bin/tsc --noEmit`
- `npm test`

No schema migration was required for this feature.

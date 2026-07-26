# Temporary Chat

## Overview

Temporary chat is now a first-class chat type inside the `/home` multi-chat system, not a global on/off mode.

For the full home navigation model, see:

- [`multi-chat-home.md`](./multi-chat-home.md)

Temporary chats are session-scoped Keen-style chats that:

- never write chat content, run state, titles, messages, search results, memory data, or lifecycle events to a remote database
- can exist multiple times at once
- appear in the sidebar under `Temporary`
- persist across reloads in the same browser tab via `sessionStorage`
- disappear when closed or when the browser tab or session ends
- stay URL-less and use `/home` rather than `/home/<conversationId>`

They are intentionally a real no-database-persistence path, not a "write then delete later" path. Prompts still transit the application server and selected model provider. See [`chat-run-lifecycle.md`](./chat-run-lifecycle.md) for the shared protocol and mode-specific limitations.

## User-Facing Behavior

### Entry point

- The header incognito button creates and selects a new temporary chat.
- Creating a temporary chat does not toggle the whole page into a separate mode.
- The selected chat simply becomes a temporary chat session.
- Creating a new temporary chat from `/home/<conversationId>` returns the URL to `/home` and should keep that new temporary chat selected on the first click.

### Sidebar behavior

- Temporary chats appear above mentors in their own section.
- Each temporary chat is labeled `Temp`.
- Each temporary chat can be selected directly from the sidebar.
- Each temporary chat can be closed directly from the sidebar.
- Temporary chats are not associated with mentor rows.
- Selecting a temporary chat returns the browser URL to `/home` and keeps that temporary chat active.
- Selecting an existing temporary chat from `/home/<conversationId>` should also succeed in one click rather than requiring a second click after route normalization.

### Header and composer behavior

- When a temporary chat is selected, the header shows `Temporary / Uses memories` or `Temporary / No memory` beside `Keen`.
- A brand-new temporary chat shows a temporary intro card above the composer.
- That intro card is shown only while the selected temporary chat has no messages.
- The intro card lets the user choose the memory mode for that specific temporary chat.
- After the first submitted message, the intro card disappears for that chat.

### Memory modes

Each temporary chat has its own `memoryMode`:

- `use_existing`: existing saved memories may be used for context, but nothing from the temporary chat is retained
- `off`: no memory is read and no memory is written

**Default:** new temporary chats start in `off` (no memory). The user can switch to `use_existing` in the intro strip above the composer before the first message.

This choice is scoped to the selected temporary chat, not to the page globally.

### Titles

- New temporary chats start as `Temporary chat`.
- After the first top-level exchange, the client uses the returned generated title when available.
- If no generated title is returned, the client falls back to a truncated version of the first user message.

## Architecture

### Client state

Temporary chat state lives in the home layer and is stored as a collection of independent sessions.

Each session carries:

- `id`
- `title`
- `memoryMode`
- `createdAt`
- `updatedAt`
- `messages`
- `threadsMap`
- `threadMessages`

The collection is serialized into `sessionStorage` under:

```ts
keen-home-temp-chats-v1
```

That gives the desired behavior:

- survives reload in the same tab
- does not sync across tabs
- does not touch the database
- preserves temporary selection while leaving `/home/<conversationId>` so the old routed persistent conversation does not briefly win selection back during the same transition

### Local run adapter

Temporary and persistent chats share `ChatRunCoordinator`, client-generated IDs, the state machine, targeting, and Stop semantics. Temporary runs remain in the coordinator and browser session only. Switching chats or navigating within the app does not cancel while the root coordinator and live connection remain available.

There is no remote run record to reconcile. A reload or unrecoverable connection loss during generation marks the run `interrupted`, and the client does not automatically retry an ambiguously acknowledged request. Completed local sessions continue to survive ordinary refreshes through `sessionStorage`.

### Temporary threads

Temporary threads reuse the inline-thread UI, but remain local-only.

- thread ids are client-generated
- thread message ids are client-generated
- thread metadata lives in the selected temporary chat's `threadsMap`
- thread message history lives in the selected temporary chat's `threadMessages`
- no `threads` rows are created for temporary chats

## Chat API Behavior

Temporary requests send enough context for the server to answer without any persistent conversation record:

```ts
{
  run: {
    runId: string,
    userMessageId: string,
    assistantMessageId: string,
    temporarySessionId: string
  },
  message: string,
  chatMode: 'temporary',
  memoryMode: 'use_existing' | 'off',
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  threadId?: string,
  threadHistory?: Array<{ role: 'user' | 'assistant'; content: string }>,
  sourceMessageId?: string,
  highlightedText?: string
}
```

On the temporary path, `POST /api/chat`:

- authenticates the user normally
- optionally loads existing memory when `memoryMode = 'use_existing'`
- does not create or validate a conversation row
- does not create or validate a thread row
- does not write user or assistant messages
- does not schedule memory extraction
- generates the first title in parallel and returns it to the local session
- bypasses database run acceptance, updates, reconciliation, events, and title persistence
- aborts live temporary generation when the client connection is genuinely lost

## Key Files

| File | Role |
|------|------|
| `frontend/lib/chat-session.ts` | Shared temporary ids, memory-mode types, and title fallback helpers |
| `frontend/lib/chat-runs/` | Shared protocol and browser run storage |
| `frontend/app/components/ChatRunCoordinator.tsx` | Root submission ownership, local temporary execution, Stop, and persistent reconciliation |
| `frontend/app/home/components/HomeDataContext.tsx` | Temporary chat collection, session storage, selection, and `/home` route coordination |
| `frontend/app/home/components/SidePanel.tsx` | Temporary section rendering, selection, and close behavior |
| `frontend/app/home/components/HomeHeader.tsx` | `New temporary chat` entry point and temporary metadata beside `Keen` |
| `frontend/app/home/components/ChatComposer.tsx` | Temporary intro card and per-chat memory mode controls |
| `frontend/app/home/components/TextSelectionPopover.tsx` | Temporary thread creation payloads |
| `frontend/app/home/components/ThreadPanel.tsx` | Temporary thread interaction UI |
| `frontend/app/api/chat/route.ts` | Zero-database-write temporary path with optional memory read |

## Intentional Limits

- Temporary chats cannot be converted into persistent chats in the current version.
- Temporary chats do not affect mentor ordering in the sidebar.
- Temporary chats are session-local only.
- Active generation is not recoverable after a true browser or connection loss.
- Image attachments retain the existing private Supabase Storage path and best-effort deletion behavior; see [`image-attachments.md`](./image-attachments.md).

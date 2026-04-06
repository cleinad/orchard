# Temporary Chat

## Overview

Temporary chat is now a first-class chat type inside the `/home` multi-chat system, not a global on/off mode.

For the full home navigation model, see:

- [`multi-chat-home.md`](/home/daniel-chen/Documents/code/projects/keen-new-tab/docs/features/multi-chat-home.md)

Temporary chats are session-scoped Keen-style chats that:

- never write to the database
- can exist multiple times at once
- appear in the sidebar under `Temporary`
- persist across reloads in the same browser tab via `sessionStorage`
- disappear when closed or when the browser tab or session ends

They are intentionally a real no-persistence path, not a "write then delete later" path.

## User-Facing Behavior

### Entry point

- The header incognito button creates and selects a new temporary chat.
- Creating a temporary chat does not toggle the whole page into a separate mode.
- The selected chat simply becomes a temporary chat session.

### Sidebar behavior

- Temporary chats appear above mentors in their own section.
- Each temporary chat is labeled `Temp`.
- Each temporary chat can be selected directly from the sidebar.
- Each temporary chat can be closed directly from the sidebar.
- Temporary chats are not associated with mentor rows.

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
  message: string,
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

On the temporary path, `POST /api/chat`:

- authenticates the user normally
- optionally loads existing memory when `memoryMode = 'use_existing'`
- does not create or validate a conversation row
- does not create or validate a thread row
- does not write user or assistant messages
- does not schedule memory extraction
- can still generate a title for the first top-level exchange and return it to the client

## Key Files

| File | Role |
|------|------|
| `frontend/lib/chat-session.ts` | Shared temporary ids, memory-mode types, and title fallback helpers |
| `frontend/app/home/page.tsx` | Temporary chat collection, session storage, selection, and client-side updates |
| `frontend/app/home/components/SidePanel.tsx` | Temporary section rendering, selection, and close behavior |
| `frontend/app/home/components/HomeHeader.tsx` | `New temporary chat` entry point and temporary metadata beside `Keen` |
| `frontend/app/home/components/ChatComposer.tsx` | Temporary intro card and per-chat memory mode controls |
| `frontend/app/home/components/TextSelectionPopover.tsx` | Temporary thread creation payloads |
| `frontend/app/home/components/ThreadPanel.tsx` | Temporary thread interaction UI |
| `frontend/app/api/chat/route.ts` | Zero-write temporary path with optional memory read |

## Intentional Limits

- Temporary chats cannot be converted into persistent chats in the current version.
- Temporary chats do not affect mentor ordering in the sidebar.
- Temporary chats are session-local only.

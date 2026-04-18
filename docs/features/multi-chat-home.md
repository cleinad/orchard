# Home Multi-Chat

## Overview

`/home` is now a multi-chat workspace rather than a one-conversation-per-mentor screen.

Persistent conversations also have canonical URLs under `/home/<conversationId>`, while drafts and temporary chats stay on `/home`.

At any moment, the user has exactly one selected chat, but that selected chat can be one of three things:

- a persistent conversation stored in Supabase
- a local persistent draft that has not been sent yet
- a temporary session chat that never touches the database

This is the canonical feature doc for the current home chat navigation model. It supersedes the older one-conversation-per-mentor and global temporary-mode mental model.

## User-Facing Behavior

### Sidebar structure

Top to bottom:

1. `Memories`
2. temporary chats, only when at least one exists
3. mentor list, including Keen

Rules:

- `Memories` always stays at the top.
- Temporary chats are pinned above the mentor list.
- Mentors are sorted by most recent persistent conversation activity, Keen included.
- Mentors with no persistent conversations sort after active mentors, alphabetically.
- Persistent chats do not have a close control in the sidebar.
- Temporary chats do have a close control.

### Mentor rows

Each mentor row shows:

- accent dot
- mentor name
- inline `+` button

Behavior:

- Clicking the mentor name expands or collapses that mentor's recent chats.
- Clicking `+` creates or reuses a local empty draft for that mentor and selects it immediately.
- There is only one empty draft per mentor at a time, including Keen.
- Draft creation is local UI state only. It does not create a `conversations` row yet.

### Mentor conversation lists

When a mentor row is expanded:

- the draft appears first if one exists
- the 3 most recent persistent conversations are shown by default
- `Show more` expands the list to 10 visible conversations, then adds 10 more each click
- `Show less` collapses back to 3

Selection rules:

- the selected persistent conversation is highlighted
- the selected draft is highlighted
- if the selected chat belongs to a collapsed mentor, that mentor auto-expands
- if the selected chat would otherwise be below the visible batch, the visible count expands enough to reveal it

### Temporary chats

Temporary chats are first-class session items, not a page-wide mode toggle.

Rules:

- multiple temporary chats can exist at once
- temporary chats are not tied to a mentor
- they behave like Keen chats, not mentor chats
- they appear in the sidebar under a `Temporary` section
- they are visually labeled `Temp`
- they can be closed directly from the sidebar
- they persist across reloads in the same browser tab via `sessionStorage`
- they disappear when closed or when the tab or session ends
- they are never written to `conversations`, `messages`, or `threads`
- they cannot be converted into persistent chats in the current version

### Draft behavior

Persistent drafts are local state until first send.

Rules:

- clicking `+` creates or reuses a local draft
- the first submitted message creates the real `conversations` row
- after the first successful exchange, the draft is promoted into a normal persistent conversation
- after that promotion, the client replaces `/home` with `/home/<conversationId>`
- if the user switches away from an empty draft without sending anything, that draft is removed

### URL behavior

The home workspace now uses the route to represent persistent chat selection.

Rules:

- `/home` is the blank workspace route
- `/home` is also used for local drafts and temporary chats
- `/home/<conversationId>` is the canonical route for persistent conversations
- clicking a persistent conversation in the sidebar pushes `/home/<conversationId>`
- clicking a draft or temporary chat returns the URL to `/home` while keeping that non-persistent chat selected
- direct loads of `/home/<conversationId>` hydrate the matching conversation into the home state
- the first successful send from a draft replaces `/home` with `/home/<conversationId>` instead of adding a fake draft route

### Titles

Persistent chats:

- before the first exchange: `New chat`
- after the first assistant response: generate a short title
- if title generation fails: fall back to the first user message, truncated

Temporary chats:

- before the first message: `Temporary chat`
- after the first assistant response: use the returned generated title when available
- if no generated title is returned: fall back to the first user message, truncated

### Deep links from `/mentors`

`/home?mentor=<slug>` resolves like this:

- if the mentor has persistent conversations, open the most recent one
- otherwise create or reuse that mentor's local empty draft

After resolution:

- persistent selections canonicalize to `/home/<conversationId>`
- draft selections stay on `/home`

## Conversation Types

### Persistent conversation

Persistent conversations are the normal database-backed chat records.

- stored in `conversations`
- top-level messages stored in `messages`
- inline threads stored in `threads` plus thread-scoped `messages`
- loaded on demand when selected
- drive mentor recency ordering in the sidebar

Keen is represented by `mentor_id = null`.

### Persistent draft

Persistent drafts are a UI affordance for fast chat creation.

- local to the current page session
- scoped to one mentor at a time
- one empty draft max per mentor
- converted to a real persistent conversation on first send
- removed if abandoned while empty

### Temporary chat

Temporary chats are session-scoped local chat sessions.

Each temporary chat carries:

- `id`
- `title`
- `memoryMode`
- `createdAt`
- `updatedAt`
- `messages`
- `threadsMap`
- `threadMessages`

They are serialized into `sessionStorage` under `keen-home-temp-chats-v1`.

## Runtime Model

### Selected chat model

The home screen tracks selection explicitly instead of inferring it from the mentor list.

The selected chat can be:

```ts
type SelectedChat =
  | { kind: 'persistent'; conversationId: string; mentorId: string | null }
  | { kind: 'draft'; draftId: string; mentorId: string | null }
  | { kind: 'temporary'; tempChatId: string };
```

This lets the UI switch instantly between:

- loaded persistent conversations
- unsent drafts
- temporary session chats

### Sidebar data model

Sidebar mentor ordering is derived client-side from:

- mentor list from `/api/mentors`
- persistent conversation list from Supabase

The client groups conversations by mentor, computes `last_activity_at`, sorts each mentor's conversations by recency, then sorts the mentor groups by most recent activity.

Opening a chat does not change sidebar ordering on its own. Ordering changes when persistent conversation activity changes.

### Route hydration model

Persistent route hydration is now part of the home orchestration layer.

- the route param is the source of truth for which persistent conversation should load
- `/home` clears route-driven persistent selection and leaves the page in blank, draft, or temporary state
- `/home/<conversationId>` loads conversation metadata, then message history, then marks that route as hydrated
- route hydration has its own loading state in the page layer and does not reuse send-in-flight loading
- while a routed persistent conversation is still hydrating and has no loaded messages yet, the transcript area shows a minimal loading placeholder instead of the normal empty-chat hero
- the normal empty hero still applies for real blank states such as `/home`, drafts, and truly empty chats after hydration completes
- route hydration reuses the same persistent message-loading path as sidebar selection instead of maintaining a separate fetch model
- stale route completions are ignored so rapid conversation switches do not clear the loading state for the active route incorrectly
- non-persistent selections use a one-shot client handoff when leaving `/home/<conversationId>` so drafts and temporary chats remain selected after the route returns to `/home`

## Chat Route Behavior

`POST /api/chat` supports three effective send paths.

### Existing persistent conversation

When `conversationId` is provided:

- validate conversation ownership
- validate or create thread when needed
- write the user message
- load persisted history
- generate the assistant reply
- write the assistant message
- process memory asynchronously

### Draft promotion

When the selected chat is a local draft:

- the client sends no `conversationId`
- the route creates a new `conversations` row
- the first exchange becomes the start of the new persistent conversation
- the route may generate a short title for that first exchange
- the client swaps selection from draft to persistent conversation

The route does not search for an existing conversation by `mentorId`. Missing `conversationId` means "create a new persistent conversation."

### Temporary chat

When `chatMode = 'temporary'`:

- authenticate the user normally
- optionally load existing memory when `memoryMode = 'use_existing'`
- do not create or validate a conversation row
- do not create or validate a thread row
- do not write user or assistant messages
- do not schedule memory extraction
- use sanitized client-provided history and optional thread history to answer

For the first top-level exchange in a temporary chat, the route can still generate a title and return it to the client, but that title is never saved to the database.

## Database Impact

Supporting multi-chat required removing the old one-conversation-per-mentor invariant.

Relevant migration:

- [`20260404113000_multi_conversation_sidebar.sql`](../../supabase/migrations/20260404113000_multi_conversation_sidebar.sql)

That migration:

- drops the unique constraint that previously enforced one persistent conversation per mentor per user
- adds recency-oriented indexes used by the sidebar loading path

## Key Files

| File | Role |
|------|------|
| `frontend/app/home/[[...conversationId]]/page.tsx` | Main orchestration for selected chat state, route-driven persistent hydration, draft lifecycle, temporary chat storage, and send-path switching |
| `frontend/app/home/components/SidePanel.tsx` | Sidebar rendering, mentor expansion, selected-item visibility, temp chat section, `Show more` behavior |
| `frontend/app/home/components/useHomeData.ts` | Loads mentors and persistent conversations, builds mentor groups, computes recency ordering, and resolves direct conversation route loads |
| `frontend/app/home/components/HomeHeader.tsx` | Header controls, including sidebar open and `new temporary chat` |
| `frontend/app/home/components/ChatComposer.tsx` | Temporary intro UI and per-temp-chat memory mode selection |
| `frontend/lib/chat-session.ts` | Shared chat-session helpers, title fallback helpers, temporary ids |
| `frontend/app/api/chat/route.ts` | Persistent vs draft vs temporary request handling, title generation, memory branching |
| `frontend/app/api/mentors/route.ts` | Mentor list endpoint used by sidebar loading |

## Intentional Limits

These are current product limits, not bugs:

- temp chats cannot be converted into persistent chats
- persistent chats do not have close or delete controls in the sidebar
- only one empty draft can exist per mentor at a time
- mentor ordering is based on persistent chat activity, not on merely viewing a chat

## Related Docs

- [`temporary-chat.md`](./temporary-chat.md)
- [`2026-03-31-multi-chat-sidebar-spec.md`](../plans/2026-03-31-multi-chat-sidebar-spec.md)

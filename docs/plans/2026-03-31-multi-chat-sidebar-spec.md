# Multi-Conversation Sidebar & Temporary Chats Spec

**Date:** 2026-03-31
**Status:** Approved for implementation

---

## Goal

Shift `/home` from a single-conversation-per-mentor model to a lightweight multi-chat model:

- multiple persistent conversations per mentor, including Keen
- multiple temporary chats at once
- fast sidebar switching without losing context
- simple mental model: contacts list + recent chats, not a separate "active chats" system

This spec is written against the current codebase, where the main surfaces are:

- [`frontend/app/home/page.tsx`](../../frontend/app/home/page.tsx)
- [`frontend/app/home/components/SidePanel.tsx`](../../frontend/app/home/components/SidePanel.tsx)
- [`frontend/app/home/components/useHomeData.ts`](../../frontend/app/home/components/useHomeData.ts)
- [`frontend/app/api/chat/route.ts`](../../frontend/app/api/chat/route.ts)
- [`frontend/app/api/mentors/route.ts`](../../frontend/app/api/mentors/route.ts)

---

## Product Rules

### Sidebar structure

Top to bottom:

1. `Memories` link
2. Temporary chats section, only when temp chats exist
3. Persistent mentor list, Keen included

Rules:

- `Memories` always stays at the very top.
- Temporary chats are pinned above mentors.
- Mentors are sorted by latest persistent conversation activity, Keen included.
- Mentors with no conversations sort after active mentors, alphabetically.
- Persistent chats do not show a close affordance.
- Temporary chats do show a close affordance.

### Mentor rows

Each mentor row shows:

- accent dot
- mentor name
- inline `+` button on the same row

Behavior:

- Clicking the mentor name toggles expand/collapse.
- Clicking `+` creates or reuses a local empty draft for that mentor and opens it immediately.
- There is only one empty draft per mentor at a time, including Keen.
- If an empty draft already exists for that mentor, `+` selects it instead of creating another.

### Mentor conversation list

When expanded:

- show the 3 most recent persistent conversations first
- show `Show more` when more exist
- first expansion beyond the default reveals up to 10 total conversations
- each later click reveals 10 more
- optional `Show less` collapses back to 3

Selection rules:

- the currently selected persistent chat is visually highlighted
- if the selected chat belongs to a collapsed mentor, that mentor auto-expands
- if the selected chat is older than the visible batch, that mentor's visible count expands enough to reveal it

### Temporary chats

Temporary chats are first-class session items, not a global mode.

Rules:

- multiple temp chats can exist at once
- temp chats are not tied to a mentor
- temp chats use Keen behavior, not mentor behavior
- temp chats are never written to the database
- temp chats persist across reloads in the same tab/session
- temp chats disappear when closed or when the browser tab/session ends
- temp chats cannot be converted into persistent chats

Display rules:

- temp chats are visually distinct and labeled `Temp`
- new temp chats appear in the temporary section immediately
- temp chats are titled `Temporary chat` until the first user message exists
- after the first exchange, the title updates from the conversation content

### Draft chat behavior

Persistent mentor drafts are local UI state until first send.

Rules:

- clicking `+` does not write to the database
- the first sent message creates the real conversation row
- if the user leaves an empty draft without sending anything, it disappears
- once the first message is sent, the draft becomes a normal persistent conversation

### Title behavior

Persistent chats:

- before the first exchange: `New chat`
- after the first assistant response: generate a short title
- if generation fails, fall back to the first user message truncated

Temporary chats:

- before the first message: `Temporary chat`
- after the first exchange: same title generation/fallback rules

### Temporary entry point

The current temporary-chat header control should stop acting as a global on/off toggle.

New behavior:

- the header incognito button creates and selects a new temp chat
- when a temp chat is selected, the header still shows temporary metadata beside `Keen`
- temporary memory mode is chosen per temp chat, not globally for the page

### Deep links from `/mentors`

Current `/home?mentor=<slug>` behavior assumes one conversation per mentor.

New behavior:

- opening `/home?mentor=<slug>` selects that mentor's most recent persistent conversation
- if no persistent conversation exists, it opens that mentor's empty local draft

---

## Current Code Constraints

### Current runtime assumptions

- [`frontend/app/api/chat/route.ts`](../../frontend/app/api/chat/route.ts) auto-reuses a mentor conversation when `conversationId` is missing.
- [`frontend/app/api/mentors/route.ts`](../../frontend/app/api/mentors/route.ts) returns `conversation_id` and `conversation_updated_at`, which bakes in one conversation per mentor.
- [`frontend/app/home/page.tsx`](../../frontend/app/home/page.tsx) models temporary chat as a single page-level mode with one temporary message list.
- [`frontend/app/home/components/useHomeData.ts`](../../frontend/app/home/components/useHomeData.ts) loads a flat list of conversations, not mentor-grouped sidebar data.

### Schema drift to reconcile first

There is migration/doc drift around mentor linkage:

- code uses `mentors` and `conversations.mentor_id`
- an older migration still references `experts` and `expert_id`
- docs SQL snapshots do not fully reflect the live mentor linkage

Implementation must verify the real deployed schema before writing the migration. Do not assume the repo snapshots are authoritative.

---

## Data Model Changes

### Database

Required:

1. Remove the unique invariant that enforces one conversation per mentor per user.
2. Keep the `mentor_id` nullable conversation link so Keen conversations still use `mentor_id = null`.
3. Add or keep indexes that support sidebar loading by recency.

Target indexing:

- `conversations(user_id, updated_at desc)`
- `conversations(user_id, mentor_id, updated_at desc)`

Migration note:

- drop the existing unique index using the actual deployed index name
- if the live schema still uses `expert_id`, reconcile that first in a dedicated migration

### Persistent conversation record

No new table is required.

Existing `conversations` row remains the unit of persistence:

- `id`
- `user_id`
- `mentor_id`
- `title`
- `created_at`
- `updated_at`

### Temporary chat session model

Add a client-only type in the home layer:

```ts
type TempChatSession = {
  id: string;
  title: string;
  memoryMode: 'use_existing' | 'off';
  createdAt: string;
  updatedAt: string;
  messages: Message[];
  threadsMap: Map<string, ThreadMeta[]>;
  threadMessages: Map<string, ThreadMessage[]>;
};
```

Persist this to `sessionStorage` under a versioned key, for example:

```ts
keen-home-temp-chats-v1
```

Because `Map` is not JSON-serializable directly, serialize thread state as arrays/records at the storage boundary.

### Local persistent draft model

Add a client-only draft model:

```ts
type PersistentDraftChat = {
  id: string;
  mentorId: string | null;
  title: 'New chat';
  createdAt: string;
  updatedAt: string;
  messages: Message[];
};
```

This is not written to Supabase. It exists only so the user can open a new chat before first send.

---

## State Model Refactor

Replace the current page-level temporary toggle model with a selected-chat model.

Recommended union:

```ts
type SelectedChat =
  | { kind: 'persistent'; conversationId: string; mentorId: string | null }
  | { kind: 'draft'; draftId: string; mentorId: string | null }
  | { kind: 'temporary'; tempChatId: string };
```

Key changes in [`frontend/app/home/page.tsx`](../../frontend/app/home/page.tsx):

- remove global `chatMode` as the primary source of truth
- remove single `temporaryMessages` / `temporaryThreadsMap` / `temporaryThreadMessages`
- keep selected chat state separate from sidebar data state
- derive the active header/composer/view state from `SelectedChat`
- keep draft chats and temp chats in local state collections keyed by id

Important derived rules:

- selected persistent conversation loads DB messages as today
- selected persistent draft reads local draft messages
- selected temp chat reads session-backed local messages
- thread UI resets when switching chats

---

## API Changes

### `/api/chat`

Current behavior must change.

New persistent rules:

- if `conversationId` is provided, validate and use it
- if `conversationId` is missing, create a new conversation row
- if `mentorId` is provided during creation, attach it to the new row
- never search for and reuse an existing conversation by `mentorId`

This removes the current single-conversation assumption in [`frontend/app/api/chat/route.ts`](../../frontend/app/api/chat/route.ts).

Temporary rules:

- keep the zero-write temporary path
- ignore mentor context for temp chats in this version
- continue using client-sent history for temp chats and temp threads

### Title generation

Add asynchronous title generation after the first assistant response for both persistent and temporary chats.

Persistent path:

- when a conversation has just completed its first exchange, generate a short title
- save it to `conversations.title`
- if generation fails, set a fallback title from the first user message

Temporary path:

- generate the title locally after the first exchange
- fall back to the truncated first user message if needed

### `/api/mentors`

Stop returning `conversation_id` and `conversation_updated_at`.

New responsibility:

- return mentor metadata only
- let the client build recency ordering and per-mentor chat lists from the conversations query

This keeps the mentors API from encoding the old one-conversation model.

---

## Sidebar Data Shape

Introduce a client-side grouped sidebar model:

```ts
type SidebarConversationItem = {
  id: string;
  mentorId: string | null;
  title: string;
  preview: string;
  createdAt: string;
  updatedAt: string;
};

type SidebarMentorGroup = {
  mentorId: string | null;
  name: string;
  accentColor: string | null;
  lastActivityAt: string | null;
  conversations: SidebarConversationItem[];
};
```

Build this in [`frontend/app/home/components/useHomeData.ts`](../../frontend/app/home/components/useHomeData.ts) from:

- mentors API response
- conversations query
- latest-message previews

Also synthesize a `Keen` group client-side using `mentorId = null`.

---

## UI Changes

### `SidePanel`

[`frontend/app/home/components/SidePanel.tsx`](../../frontend/app/home/components/SidePanel.tsx) becomes a grouped sidebar instead of a flat conversation list.

Required content:

- top `Memories` link
- temporary chat list with close buttons
- mentor rows sorted by recency
- expandable recent conversation lists per mentor

Required controls:

- mentor row `+`
- `Show more`
- optional `Show less`
- temp chat close `x`

Do not add a close/delete affordance to persistent conversations in this pass.

### `HomeHeader`

[`frontend/app/home/components/HomeHeader.tsx`](../../frontend/app/home/components/HomeHeader.tsx):

- keep the sidebar button
- keep the mentors browse button
- repurpose the temporary icon to `new temp chat`
- show temporary metadata only when the selected chat is temporary

### `ChatComposer`

[`frontend/app/home/components/ChatComposer.tsx`](../../frontend/app/home/components/ChatComposer.tsx):

- keep the temporary intro card, but scope it to the selected temp chat
- memory mode selector now updates only that temp chat
- empty persistent drafts should not show temporary messaging

### `ConversationView`

No major visual redesign required.

Behavioral updates only:

- empty persistent draft shows `New chat`
- temp chat empty state shows temporary language
- active name remains `Keen` for temp chats, with temporary metadata in the header

---

## Implementation Order

### Phase 1: Schema and API

1. Verify live mentor linkage and existing unique index name.
2. Add migration to remove the single-conversation-per-mentor constraint.
3. Update `/api/chat` so missing `conversationId` means "create new conversation", not "reuse mentor conversation".
4. Add title generation/fallback path.
5. Remove conversation-specific fields from `/api/mentors`.

### Phase 2: Client state model

1. Add selected-chat union type.
2. Add local persistent draft state.
3. Add temp chat collection with `sessionStorage` persistence.
4. Move temp thread state inside each temp chat.
5. Update `/home?mentor=<slug>` handling.

### Phase 3: Sidebar UI

1. Replace flat conversation list with grouped mentor rows.
2. Add temp chat section and close behavior.
3. Add mentor `+` behavior.
4. Add per-mentor expansion state and `Show more`.
5. Guarantee selected chat visibility.

### Phase 4: Send/switch flows

1. Existing persistent conversation send path still works with explicit `conversationId`.
2. Draft send path creates conversation on first send, then swaps selection to the returned persistent conversation.
3. Temp send path updates only the selected temp chat.
4. Switching away from an empty draft removes it.

### Phase 5: Cleanup and verification

1. Update mentor and temporary-chat docs.
2. Add tests for sidebar grouping, draft reuse, temp chat session persistence, and send-path conversion.
3. Run app verification for keyboard/mouse flows and refresh behavior.

---

## Verification Checklist

- create multiple Keen chats and switch between them
- create multiple chats for the same mentor and verify no reuse occurs
- confirm mentor ordering updates only when messages are sent
- confirm opening a chat does not change mentor ordering
- confirm only one empty draft exists per mentor
- confirm empty drafts disappear when abandoned
- confirm multiple temp chats survive reload in the same tab
- confirm temp chats disappear after session end
- confirm temp chats never create `conversations`, `messages`, or `threads` rows
- confirm a selected older chat is still visible when its mentor group is expanded
- confirm `/home?mentor=<slug>` opens most recent chat or a fresh draft

---

## Main Risk

The highest-risk part is not the UI. It is schema drift.

Before implementation starts, verify the real Supabase schema for:

- mentor linkage column name
- current unique index name
- any existing title/default behavior on `conversations`

That check should happen before writing the migration or changing the chat route.

# Multi-Chat Home

The home surface supports multiple persistent chats, local drafts, temporary
chats, and workspace chats from one sidebar.

## Chat types

### Persistent chat

A persistent chat has a `conversations` row, messages in Supabase, and a stable
URL:

```text
/home/<conversationId>
```

Opening the URL hydrates the conversation, its active branch path, inline-thread
metadata, attachments, and search metadata.

### Draft

A draft is an empty local composer associated with either the general chat area
or a workspace. It has no database row until the first send.

There is at most one empty draft per context. The first send creates stable
client identifiers, starts the run, and promotes the draft to a persistent
conversation. If the request is not accepted, the promotion is rolled back.

### Temporary chat

A temporary chat has no conversation URL and is kept in browser session state.
See [Temporary chats](./temporary-chat.md).

## Sidebar

The sidebar is organized into:

- Workspaces, each with expandable chats and a new-chat action
- Temporary chats
- General Chats

Chats are ordered by recent activity. Long sections reveal more items
incrementally. On desktop, the panel width is resizable and stored locally.

Selecting a chat switches the active transcript without treating sidebar data
as the message source of truth.

## Routing

`/home` is the URL-less composer surface. `/home/<conversationId>` identifies a
persistent chat.

When a selected routed chat changes:

1. the route parameter becomes the intended persistent selection
2. cached transcript data may render immediately
3. the client fetches current conversation data
4. the loaded path replaces or reconciles with the cache

The UI shows a routed-history loading state instead of briefly displaying an
empty composer.

Selecting a draft or temporary chat while on a conversation route uses a
session-scoped handoff, navigates to `/home`, and restores the intended local
selection. That prevents local-only identifiers from appearing in the URL.

## Per-chat state

Composer drafts, search mode, response style, active branch choices, thread
runtime, and scroll position are keyed to the selected chat rather than shared
globally.

Model selection is a global preference with per-model effort and thinking
overrides. See [Model selection](./chat-model-selection.md).

## Titles

The first user prompt supplies an immediate fallback title. A persistent run can
replace it with a generated title. Title provenance and versioning prevent late
or older runs from overwriting a newer title.

Temporary chats derive a local title and never request title persistence.

## Key implementation

- `frontend/app/home/[[...conversationId]]/page.tsx`
- `frontend/app/home/components/HomeDataContext.tsx`
- `frontend/app/home/components/useHomeData.ts`
- `frontend/app/home/components/useRouteConversationHydration.ts`
- `frontend/app/home/components/useHomeChatSwitchLifecycle.ts`
- `frontend/app/home/components/SidePanel.tsx`

## Verification

- `frontend/e2e/home-routing.spec.js`
- `frontend/__tests__/app/home/home-runtime-helpers.test.ts`
- `frontend/__tests__/app/home/useMainChatRuntime.test.ts`

## Related docs

- [Temporary chats](./temporary-chat.md)
- [Chat run lifecycle](./chat-run-lifecycle.md)
- [Workspaces](./workspaces.md)
- [Conversation branching](./conversation-branching.md)

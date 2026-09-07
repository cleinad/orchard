# Conversation Branching

Conversation branches let a user start an alternate path from an earlier
assistant response without discarding the path they were already following.

Branches are part of the main chat's message tree. Inline threads are separate
side conversations attached to selected text.

## User flow

1. Choose the branch action on an assistant response.
2. Orchard marks that response as the pending branch source.
3. Send a new prompt from the main composer.
4. The new user message becomes the first message on an alternate path.
5. Use branch chips or the conversation map to switch between paths.

Starting a branch never deletes the existing continuation. Cancelling before
sending returns to the current path without creating branch state.

## Message tree

Every main-chat message can point to its predecessor through
`messages.previous_message_id`. That makes the transcript a tree instead of a
single chronological list.

The active transcript is the path selected through that tree:

- messages outside the active path remain persisted but hidden from the
  transcript
- a reply continues from the tail of the active path
- switching a branch changes the visible path and the context sent on the next
  request

`conversation_branches` stores the branch identity, source assistant message,
entry user message, and whether the branch is the original path.

## Branch chips

When an assistant response has more than one continuation, a chip beside that
response shows the active choice and allows switching.

Branch labels use the first user prompt on each path. The original continuation
is represented as the main path; alternate branches have their own IDs.

## Conversation map

The map visualizes the complete conversation tree:

- each prompt and response pair becomes a node
- branches form separate lanes
- the active route is visually distinct
- selecting a node updates the active branch choices and navigates to the
  corresponding transcript message

On desktop the map can share the screen with the chat and has a resizable split.
On smaller screens it opens as an overlay. Map pan, zoom, follow behavior, split
ratio, and active route are client-side view state.

## Persistence modes

Persistent chats store branch records and predecessor links in Supabase.
Temporary chats keep the same logical tree in browser session state.

A draft chat can build a local branch tree. Its first successful persistent send
promotes the draft to a conversation while preserving the selected path and
stable client-generated identifiers.

## Context isolation

The server reconstructs only the path leading to the submitted user message.
Messages from sibling paths must not leak into the prompt or search planning for
the active path.

## Key implementation

- `frontend/app/home/components/conversationTree.ts`
- `frontend/app/home/components/conversationMapModel.ts`
- `frontend/app/home/components/ConversationMap.tsx`
- `frontend/app/home/components/useConversationMapRuntime.ts`
- `frontend/app/home/components/useMainChatRuntime.ts`
- `frontend/app/api/chat/route.ts`

## Verification

- `frontend/e2e/conversation-map.spec.js`
- `frontend/__tests__/app/home/conversation-map-model.test.ts`
- branch cases in `frontend/__tests__/app/chat-route.test.ts`

## Related docs

- [Inline threads](./inline-threads.md)
- [Multi-chat home](./multi-chat-home.md)
- [Chat run lifecycle](./chat-run-lifecycle.md)

# Workspace Chat Dragging And Memory Provenance

## Goal

Users should be able to move chats into and out of workspaces by dragging them in the sidebar. Memory should follow the user's intent without leaking private workspace context into global memory by accident.

This document also outlines the memory provenance overhaul needed for the clean long-term version: one memory item should be able to link to multiple source chats and messages.

## Desired User Model

A chat can belong to exactly one context:

- global Keen
- a workspace
- a mentor

For this feature, dragging is focused on global Keen chats and workspace chats. Mentor chat moves should remain out of scope until there is a clear product model for mentor memory.

Moving a chat should feel like moving the conversation and its relevant learned context together.

## Current Memory Model

`memory_items` stores one atomic fact per row.

Relevant columns:

- `owner_type`: `global`, `mentor`, or `workspace`
- `owner_id`: null for global, mentor id for mentor memory, workspace id for workspace memory
- `source_conversation_id`: the conversation that produced the memory
- `source_message_id`: the message that produced the memory

This works for simple scoping, but it has a limitation: one memory row can only point to one source conversation and one source message. In practice, a memory can be reinforced, merged, or updated across several chats.

Example:

- Chat A produces "User prefers concise derivations."
- Chat B repeats the same preference and merges into the same memory.
- The memory should ideally know that both Chat A and Chat B support it.

The current model cannot represent that fully.

## Near-Term Drag Behavior

### Drag Global Chat Into Workspace

When a user drags a global chat into a workspace:

1. Update `conversations.workspace_id` to the target workspace id.
2. Ensure `conversations.mentor_id` is null.
3. Move eligible memory from global to the target workspace.
4. Refresh sidebar groups.
5. Keep the user in the same selected chat if it was open.

Eligible memory in the current model:

```sql
source_conversation_id = movedConversationId
and owner_type = 'global'
and owner_id is null
```

Those rows can be updated to:

```sql
owner_type = 'workspace'
owner_id = targetWorkspaceId
```

After the move, future sends in that chat should:

- read global + target workspace memory
- write workspace-owned memory

### Drag Workspace Chat Out To Global

This move is more sensitive because it can promote workspace-local context into global scope.

Recommended v1 behavior:

1. Ask for confirmation.
2. Move the conversation out by setting `workspace_id = null`.
3. Do not automatically promote workspace-owned memories to global.
4. Future sends in the moved chat write new memory globally.

Confirmation copy:

```text
Move this chat out of the workspace?

The chat will move to Keen. Existing workspace memories from this chat will stay in the workspace and will not become global.
```

This is conservative. It prevents accidental leakage from a private workspace into global memory.

Optional follow-up action:

- Offer a separate explicit "Move this chat's memories to global" action.
- This should be a deliberate choice, not the default drag behavior.

### Drag Chat Between Workspaces

This can be added after in/out moves.

Recommended behavior:

1. Move `conversations.workspace_id` from source workspace to target workspace.
2. Move memories whose provenance points only to that chat from source workspace to target workspace.
3. For memories linked to multiple chats, only move the memory if all supporting chats are also in the target workspace.
4. Otherwise, keep the memory in the source workspace and create or link a target-scoped copy if future chat activity re-extracts it.

This behavior is much easier after the provenance overhaul.

## Why Memory Provenance Needs An Overhaul

Dragging exposes a weakness in the current `source_conversation_id` model.

Questions the app needs to answer:

- Which chats contributed to this memory?
- Which messages contributed to this memory?
- Is this memory supported only by the chat being moved?
- Is this memory shared by multiple chats in the same workspace?
- Is this memory a global profile fact that should not move with a single chat?
- If a memory was merged from several chats, should moving one chat move the whole memory?

With a single `source_conversation_id`, the app can only answer the first-source or latest-source version of these questions.

## Proposed Long-Term Data Model

Keep `memory_items` as the canonical atomic memory row.

Add a join table:

```sql
create table public.memory_item_sources (
  id uuid primary key default gen_random_uuid(),
  memory_item_id uuid not null references public.memory_items(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  message_id uuid references public.messages(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  source_role text check (source_role in ('user', 'assistant')),
  contribution_type text not null default 'extracted',
  created_at timestamptz not null default now(),
  unique (memory_item_id, conversation_id, message_id, contribution_type)
);
```

Indexes:

```sql
create index idx_memory_item_sources_memory_item_id
  on public.memory_item_sources(memory_item_id);

create index idx_memory_item_sources_conversation_id
  on public.memory_item_sources(user_id, conversation_id);

create index idx_memory_item_sources_message_id
  on public.memory_item_sources(user_id, message_id);
```

RLS:

- Users can select rows where `auth.uid() = user_id`.
- Users can insert rows where `auth.uid() = user_id`.
- Users can delete rows where `auth.uid() = user_id`.
- Updates are likely unnecessary for v1.

### Compatibility Columns

Keep these columns temporarily:

- `memory_items.source_conversation_id`
- `memory_items.source_message_id`
- `memory_items.source_role`

They can remain as a primary or earliest source for display compatibility. New code should read from `memory_item_sources` when it needs full provenance.

## Memory Agent Changes

When `processMemoryV2()` inserts a new memory:

1. Insert `memory_items` as today.
2. Insert a `memory_item_sources` row linking the memory to the active conversation and source message.

When it merges into an existing memory:

1. Update the memory row as today.
2. Insert a new `memory_item_sources` row for the current conversation/message if one does not already exist.

When it supersedes an old memory:

1. Mark the old memory as `superseded`.
2. Insert the new memory.
3. Link the new memory to the current conversation/message.
4. Optionally link the new memory to the old memory's sources if the new item is a direct replacement.

The key change is that memory extraction reinforces provenance even when it does not create a new memory row.

## Drag Semantics With Provenance

### Move Global Chat Into Workspace

For each active global memory linked to the moved chat:

- If all active source conversations for that memory are being moved into the same workspace, move the memory to the workspace.
- If the memory has sources outside the moved chat, keep the global memory global and create a workspace-scoped copy only if needed.

The copy path avoids stealing a global memory away from other chats.

### Move Workspace Chat Out To Global

For each active workspace memory linked to the moved chat:

- If all active source conversations for that memory are being moved out, the app can offer to move the memory to global.
- If other source conversations remain in the workspace, keep the memory in the workspace.
- If the user explicitly promotes memory to global, create or merge a global copy instead of mutating the workspace row in place.

Default should still be conservative: move the chat, leave existing workspace memories in the workspace.

### Move Workspace Chat To Another Workspace

For each active memory linked to the moved chat:

- If every source conversation for that memory is moving to the target workspace, move the memory.
- If only some sources are moving, keep the original memory and create or merge a target workspace copy.
- Link the target copy to the moved chat's source rows.

This prevents a memory from disappearing from the source workspace when other chats there still rely on it.

## API Design

Add a focused move endpoint:

```http
PATCH /api/conversations/:conversationId/context
```

Request body:

```json
{
  "workspaceId": "target-workspace-id-or-null",
  "memoryPolicy": "conservative"
}
```

Initial memory policies:

- `conservative`: never promote workspace memory to global automatically
- `move_single_source`: move memories only when the moved chat is the only source
- `copy`: copy eligible memories into the target scope, leaving originals in place

For v1, use `conservative` only. More policies can be added when the UI has explicit confirmation.

Response:

```json
{
  "conversation": {
    "id": "conversation-id",
    "workspaceId": "target-workspace-id-or-null"
  },
  "memory": {
    "moved": 0,
    "copied": 0,
    "leftInPlace": 3
  }
}
```

## Validation Rules

The API should reject:

- unauthenticated requests
- conversations not owned by the user
- target workspaces not owned by the user
- moving mentor conversations until mentor moves are explicitly supported
- moving a chat into a workspace while keeping `mentor_id`
- no-op moves unless the UI wants idempotent success

The API should preserve:

- conversation title
- messages
- branches
- attachments
- search metadata
- response style draft state where possible

## Sidebar Drag UX

Expected interactions:

- Drag a chat row from `All chats` or Keen into a workspace group.
- Drag a chat row from a workspace group to the Keen/global section.
- Highlight valid drop targets.
- Do not allow dropping onto mentors in v1.
- Do not allow dropping temporary chats.
- Do not allow dropping draft chats unless draft movement is designed separately.

Drop target states:

- Valid workspace target
- Valid Keen/global target
- Invalid target
- Pending move
- Move failed

Failure behavior:

- Return the chat to its original group.
- Show a concise error.
- Do not mutate local memory state optimistically unless the server move succeeds.

## Confirmation Rules

Moving into a workspace:

- Usually no confirmation.
- It is a narrowing move: future memory writes become workspace-owned.

Moving out of a workspace:

- Confirmation recommended.
- Copy should explain that existing workspace memories stay in the workspace unless explicitly moved.

Moving between workspaces:

- Confirmation optional.
- If memory copying/moving is included, the confirmation should say what happens.

## Edge Cases

Chat has no memories:

- Move only the conversation.
- Return zero memory counts.

Chat has global memories shared with other chats:

- Do not move the global row in place.
- With provenance, create or merge a workspace copy if the user asks for memory to follow.

Chat has workspace memories also sourced from other chats in the workspace:

- Do not move the memory out of the source workspace in place.
- Keep it where the remaining source chats can use it.

Chat is currently open:

- Keep the chat open after the move.
- Update header and sidebar grouping.
- Ensure the next `/api/chat` call sends the new `workspaceId`.

Chat has an in-flight response:

- Disable dragging while pending, or reject server-side with `409`.
- Avoid changing memory scope mid-extraction.

Moving a chat into a deleted workspace:

- Reject with `404`.
- Refresh sidebar data.

Moving a chat whose workspace was deleted in another tab:

- Treat the chat according to the database state.
- If workspace deletion cascades conversations, the move should return `404`.

Moving branched conversations:

- Move the conversation as a whole.
- Branches are part of the same conversation and should not move independently.

Moving chats with attachments:

- No storage movement is needed if attachment storage paths are user-scoped rather than workspace-scoped.

Memory duplicates in target scope:

- Use the existing normalized text and similarity merge rules.
- Prefer merging into an existing target-scoped memory over creating duplicate rows.
- Add provenance to the merged target memory.

Sensitive memories:

- Never promote private or sensitive workspace memories to global without explicit confirmation.
- Consider blocking automatic promotion entirely for `sensitivity = 'private'` or `sensitivity = 'sensitive'`.

Deleted or superseded memories:

- Do not move deleted memories.
- Usually do not move superseded memories.
- Provenance can remain for audit/history, but active recall should ignore them.

## Implementation Phases

### Phase 1: Conservative Chat Moves

- Add move endpoint.
- Support global to workspace.
- Support workspace to global with confirmation.
- Do not overhaul provenance yet.
- For memories, only move rows where `source_conversation_id` equals the moved chat and the move is narrowing into a workspace.
- Do not automatically promote workspace memories to global.

This phase is useful but imperfect.

### Phase 2: Memory Provenance Table

- Add `memory_item_sources`.
- Backfill from existing `source_conversation_id` and `source_message_id`.
- Update `processMemoryV2()` to insert provenance rows for inserts, merges, and supersedes.
- Add tests proving a memory can link to multiple chats.

### Phase 3: Provenance-Aware Moves

- Use `memory_item_sources` to decide whether to move, copy, merge, or leave memory in place.
- Add memory counts to move responses.
- Add confirmation details for moves that affect memories.

### Phase 4: Memory UI Provenance

- Show which chats contributed to a memory.
- Let the user inspect memory sources.
- Eventually allow unlinking a memory from a chat without deleting the memory globally.

## Tests

API tests:

- Moving a global chat into a workspace updates `workspace_id`.
- Moving into a workspace validates workspace ownership.
- Moving a workspace chat out sets `workspace_id = null`.
- Moving a mentor chat is rejected.
- Moving someone else's chat is rejected.
- No-op moves are handled predictably.
- In-flight or locked chats return `409` if the implementation adds locking.

Memory tests before provenance overhaul:

- Global memories from the moved chat can move into the workspace.
- Global memories from other chats do not move.
- Workspace memories do not promote to global by default.
- Existing workspace memories from other workspaces are untouched.

Memory tests after provenance overhaul:

- A merged memory records multiple source conversations.
- Moving one source chat does not steal a memory away from remaining source chats.
- Moving all source chats can move the memory.
- Copying creates or merges a target-scoped memory and preserves source links.
- Sensitive workspace memories are not promoted to global automatically.

E2E tests:

- Drag a global chat into a workspace and see it appear under that workspace.
- Continue the moved chat and verify the request includes the new `workspaceId`.
- Drag a workspace chat out and confirm the modal.
- Canceling the modal leaves the chat in the workspace.
- Invalid drops visibly reject without changing groups.

## Non-Goals For The First Drag Version

- Moving mentor chats
- Moving temporary chats
- Moving draft chats
- Multi-select drag
- Undo
- Workspace-to-workspace memory splitting
- Full memory provenance UI
- Restoring old memory scope after a move

These can come later once the basic context move is reliable.


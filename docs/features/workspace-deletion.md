# Workspace Deletion

## Goal

Deleting a workspace should preserve the user's mental model that a workspace is a scope boundary. When a workspace is deleted, the conversations and memories inside it should be deleted with it instead of becoming global chats or global memories.

This feature should be implemented before chat dragging or broader memory provenance work.

## Product Behavior

Users can delete a workspace from the workspace page.

The delete action should remove:

- the workspace
- every conversation with `conversations.workspace_id = workspace.id`
- every workspace-owned memory with `memory_items.owner_type = 'workspace'` and `memory_items.owner_id = workspace.id`
- embeddings for deleted workspace memories
- related conversation data that already cascades from conversation or message deletion, such as branches and message attachments

The delete action should not remove:

- global memory
- mentor memory
- conversations outside the workspace
- conversations in other workspaces
- other workspaces

## UX Placement

The primary entry point should live on `/workspaces/:workspaceId`.

Recommended placement:

- Add a compact overflow button in the workspace page header near rename or workspace actions.
- The overflow menu should include `Delete workspace`.
- Keep the button visually quiet. Deleting is important, but it should not be a loud persistent button in the main workspace content.

Sidebar deletion can be added later through a context menu or workspace settings entry. The first implementation should prefer the dedicated workspace page because the user has more context there.

## Confirmation Flow

Deletion should require a modal confirmation.

The confirmation should make the data loss explicit:

```text
Delete this workspace?

This will permanently delete the workspace, all chats in it, and all memories saved to it. Global memory will not be changed.
```

The destructive action label should be specific:

```text
Delete workspace and chats
```

Recommended controls:

- `Cancel`
- `Delete workspace and chats`

The modal should close on cancel and escape, but not while the delete request is pending.

Optional stricter confirmation:

- Require typing the workspace name if the workspace has more than a small number of chats or memories.
- This can wait unless accidental deletion feels likely in testing.

## API Contract

Use the existing endpoint:

```http
DELETE /api/workspaces/:workspaceId
```

Current behavior only deletes the workspace row. The new behavior should delete scoped data intentionally.

Response on success:

```json
{
  "success": true,
  "deleted": {
    "workspace": 1,
    "conversations": 12,
    "memoryItems": 8
  }
}
```

The counts are useful for tests and debugging. They do not need to be exposed in the UI.

Expected errors:

- `401` when unauthenticated
- `404` when the workspace does not belong to the user or does not exist
- `500` for unexpected database or storage cleanup errors

## Backend Deletion Order

The route should verify ownership first:

1. Fetch the workspace by `id` and `user_id`.
2. Return `404` if it is not found.
3. Load workspace-owned memory ids.
4. Delete embeddings for those memory ids.
5. Delete workspace-owned memory rows, or soft-delete them if the product wants recovery later.
6. Delete conversations in the workspace.
7. Delete the workspace.

Conversation deletion should be filtered by both workspace and user:

```ts
.from('conversations')
.delete()
.eq('user_id', user.id)
.eq('workspace_id', workspaceId)
```

Workspace memory deletion should be filtered by user and owner:

```ts
.from('memory_items')
.delete()
.eq('user_id', user.id)
.eq('owner_type', 'workspace')
.eq('owner_id', workspaceId)
```

Embedding deletion can use ids:

```ts
.from('memory_item_embeddings')
.delete()
.eq('user_id', user.id)
.in('memory_item_id', memoryIds)
```

If the memory system keeps soft deletes as the preferred user-facing behavior, use `status = 'deleted'` and delete embeddings. For workspace deletion, hard delete is simpler and cleaner because the owning workspace no longer exists. The implementation should choose one behavior deliberately and test it.

## Database Considerations

The current workspace migration sets:

```sql
conversations.workspace_id uuid references public.workspaces(id) on delete set null
```

That is not the desired product behavior for explicit workspace deletion. It allows old workspace conversations to become unscoped global conversations after the workspace row disappears.

Recommended follow-up migration:

```sql
alter table public.conversations
  drop constraint if exists conversations_workspace_id_fkey;

alter table public.conversations
  add constraint conversations_workspace_id_fkey
  foreign key (workspace_id)
  references public.workspaces(id)
  on delete cascade;
```

If the app deletes workspace conversations manually in the route, this migration is still useful as a defensive invariant.

Memory rows currently do not have a foreign key to `workspaces` because `owner_id` can point to mentors or workspaces depending on `owner_type`. That means workspace memory cleanup must be explicit in the delete route or handled by a database trigger.

## Storage And Attachments

`message_attachments.message_id` cascades when messages are deleted. That removes attachment metadata rows, but it may not remove the underlying storage objects from the `chat-images` bucket.

Before deleting conversations, the route should consider loading attachment `storage_path` values for messages in the workspace and removing those storage objects after database deletion succeeds.

Safe v1 behavior:

- Delete database rows first.
- Best-effort remove storage objects.
- Log storage cleanup failures without failing the whole workspace deletion.

Strict behavior:

- Remove storage objects first.
- Fail the request if storage cleanup fails.

The safe v1 behavior is less likely to leave the user stuck unable to delete a workspace.

## Frontend State After Delete

After a successful delete:

- Refresh sidebar data.
- Clear any selected chat that belonged to the deleted workspace.
- Navigate to `/home`.
- Show no workspace memory from the deleted workspace.

If the user currently has a chat from the workspace open in another tab or route:

- The next route hydration should fail with a not-found or unavailable state.
- Sending to a deleted workspace conversation should not silently create global memory.

## Chat Runtime Guardrail

Even with cascade deletion, `/api/chat` should defensively reject an existing conversation that used to have a workspace but no longer has one only if the system can identify that state.

The current schema cannot distinguish:

- a true global conversation with `workspace_id = null`
- an orphaned former workspace conversation after `ON DELETE SET NULL`

This is another reason to avoid `ON DELETE SET NULL` for workspace conversations.

## Tests

Unit/API tests:

- `DELETE /api/workspaces/:id` returns `401` when unauthenticated.
- It returns `404` when the workspace is owned by another user or does not exist.
- It deletes only conversations where `workspace_id` matches the workspace and `user_id` matches the current user.
- It deletes only workspace-owned memories for that workspace.
- It deletes embeddings for deleted workspace memories.
- It does not delete global memory.
- It does not delete mentor memory.
- It does not delete other workspace memories.
- It does not delete conversations in other workspaces.
- It returns useful delete counts.

Migration tests:

- `conversations.workspace_id` should use `ON DELETE CASCADE`, or the route should have explicit deletion coverage proving no orphaned conversations remain.

E2E tests:

- The workspace page exposes delete from an overflow/menu action.
- The confirmation text mentions chats and memories.
- Cancel leaves the workspace intact.
- Confirm deletes the workspace and redirects to `/home`.
- The deleted workspace no longer appears in the sidebar.
- Its chats no longer appear under all chats or workspace groups.

## Edge Cases

Deleting an empty workspace:

- Should work.
- Confirmation can still mention chats and memories.

Deleting while a chat response is streaming:

- The delete button can be disabled if there is an active request in the workspace.
- If not disabled, the response reconciliation should tolerate missing conversation rows and avoid re-creating state.

Deleting with workspace page open in multiple tabs:

- The second tab should see a not-found state or redirect after refresh.
- A second delete should return `404` or idempotent success. Prefer `404` for consistency with ownership checks.

Deleting a workspace with shared or merged memories:

- In the current memory model, delete rows where `owner_type = 'workspace'` and `owner_id = workspaceId`.
- After the provenance overhaul, only delete or detach associations owned by the workspace unless no other provenance remains.

Deleting a workspace with uploaded images:

- Database metadata should cascade through message deletion.
- Storage objects need explicit cleanup or accepted best-effort orphan cleanup.

## Non-Goals

This first implementation should not add:

- moving chats between workspaces
- restoring deleted workspaces
- archive instead of delete
- exporting workspace data
- partial delete options
- memory provenance overhaul

Those are valid future features, but they should not block the first delete flow.


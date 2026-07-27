# Workspaces

Workspaces group persistent chats around a subject or project. Each workspace
has a dedicated page, shared instructions, and its own memory scope.

## User model

A workspace contains:

- a name, optional description, icon, and accent color
- persistent chats
- instructions applied to every chat in the workspace
- memory learned from workspace chats

The workspace page is `/workspaces/<workspaceId>`. The sidebar can expand each
workspace and create a workspace-scoped draft.

## Instructions

Workspace instructions are editable from the workspace page and stored in the
workspace `context` field. They are added to the system prompt for every chat in
that workspace.

They are appropriate for subject background, learning goals, constraints,
preferred notation, or recurring project context.

## Memory

Workspace chats:

- read global memory plus memory owned by the workspace
- write extracted memory to the workspace

Workspace memory is not exposed to general chats or other workspaces.

`memory_item_sources` tracks which conversations support a memory item. That
provenance determines what happens when chats move.

## Moving chats

Persistent chats can be dragged between the general Chats section and
workspaces, or between workspaces.

The current conservative memory policy is:

- Moving into a workspace also moves active source-scope memories supported only
  by that chat.
- A memory supported by other conversations stays in its original scope.
- Moving out of a workspace never promotes workspace memory to global memory.
- Future messages and extracted memories use the chat's new context.

Moving a workspace chat back to general Chats requires confirmation because its
existing workspace memories remain scoped to the workspace.

The move is performed by
`PATCH /api/conversations/<conversationId>/context` and the
`move_conversation_context` database function.

## Deletion

Deleting a workspace requires confirmation and permanently removes:

- the workspace
- its conversations, main messages, branches, and inline threads
- workspace-owned memory
- attachment metadata associated with deleted messages

The deletion function returns Storage paths, and the route then attempts to
remove those private image objects. Global memory is not changed.

After success, local workspace drafts and selected state are cleared, sidebar
data is refreshed, and navigation returns to `/home`.

## API

- `GET /api/workspaces`
- `POST /api/workspaces`
- `GET /api/workspaces/<workspaceId>`
- `PATCH /api/workspaces/<workspaceId>`
- `DELETE /api/workspaces/<workspaceId>`
- `PATCH /api/conversations/<conversationId>/context`

All routes authenticate with Supabase and scope operations to the current user.

## Key implementation

- `frontend/app/workspaces/[workspaceId]/page.tsx`
- `frontend/app/api/workspaces/route.ts`
- `frontend/app/api/workspaces/[workspaceId]/route.ts`
- `frontend/app/api/conversations/[conversationId]/context/route.ts`
- `frontend/app/home/components/SidePanel.tsx`
- `frontend/lib/workspaces.ts`
- `supabase/migrations/20260719001000_production_schema_baseline.sql`

## Verification

- `frontend/e2e/workspaces.spec.js`
- `frontend/__tests__/app/workspaces-route.test.ts`
- `frontend/__tests__/supabase/workspaces-migration.test.ts`
- `supabase/tests/database.sql`

## Related docs

- [Multi-chat home](./multi-chat-home.md)
- [Memory](./memory.md)
- [Image attachments](./image-attachments.md)
- [Authentication](./auth-and-route-protection.md)

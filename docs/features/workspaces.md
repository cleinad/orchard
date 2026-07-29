# Workspaces

Workspaces group persistent chats around a subject or project. Each workspace
has a dedicated page and shared instructions.

## User model

A workspace contains:

- a name, optional description, icon, and accent color
- persistent chats
- instructions applied to every chat in the workspace

The workspace page is `/workspaces/<workspaceId>`. The sidebar can expand each
workspace and create a workspace-scoped draft.

## Instructions

Workspace instructions are editable from the workspace page and stored in the
workspace `context` field. They are added to the system prompt for every chat in
that workspace.

They are appropriate for subject background, learning goals, constraints,
preferred notation, or recurring project context.

## Moving chats

Persistent chats can be dragged between the general Chats section and
workspaces, or between workspaces.

Moving a chat changes its workspace context. Future messages use the shared
instructions for that context; moving a chat back to general Chats clears the
workspace context.

The move is performed by
`PATCH /api/conversations/<conversationId>/context` and the
`move_conversation_context` database function.

## Deletion

Deleting a workspace requires confirmation and permanently removes:

- the workspace
- its conversations, main messages, branches, and inline threads
- attachment metadata associated with deleted messages

The deletion function returns Storage paths, and the route then attempts to
remove those private image objects.

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
- [Image attachments](./image-attachments.md)
- [Authentication](./auth-and-route-protection.md)

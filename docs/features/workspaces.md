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

Home and workspace routes share one persistent authenticated chat-shell layout.
The server initializes viewer, model, mentor, workspace-summary, and
conversation-summary state. A workspace page separately loads one
RLS-protected detail row and includes the workspace identity, conversations,
composer, and instructions in the initial HTML.

Workspace links prefetch the full dynamic route payload on pointer or keyboard
intent. Navigation retains the chat shell and active runs instead of remounting
or repeating the sidebar bootstrap.

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
`move_conversation_context` database function. On success, the returned
conversation summary updates the selected chat and affected sidebar groups
without reloading mentors, workspaces, or conversations. A failed PATCH leaves
the local placement unchanged.

## Deletion

Deleting a workspace requires confirmation and permanently removes:

- the workspace
- its conversations, main messages, branches, and inline threads
- attachment metadata associated with deleted messages

The deletion function returns Storage paths, and the route then attempts to
remove those private image objects.

After success, local workspace drafts and selected state are cleared, the
workspace and its conversations are removed from shared client state, and
navigation replaces the deleted route with `/home`, so browser Back cannot
restore the deleted page. Normal success does not reload the mentor, workspace,
or conversation lists.

Rename and instruction updates also update focused page/sidebar state
optimistically and roll back on failure. Starting a workspace conversation
locally upserts its returned summary while preserving the first-send handoff to
the normal home chat runtime. Successful workspace updates and deletes
revalidate the workspace route so a prefetched or previously visited payload
cannot restore stale detail.

## API

- `GET /api/workspaces`
- `POST /api/workspaces`
- `GET /api/workspaces/<workspaceId>`
- `PATCH /api/workspaces/<workspaceId>`
- `DELETE /api/workspaces/<workspaceId>`
- `PATCH /api/conversations/<conversationId>/context`

All routes authenticate with Supabase and scope operations to the current user.
The list response contains summary fields and excludes long-form workspace
`context`. Production page rendering uses server data loaders, and production
workspace mutations use server actions, rather than the browser routes. The
server actions and mutation routes share authoritative `getUser()` verification
and RLS-scoped mutation logic.

## Key implementation

- `frontend/app/(authenticated)/(chat-shell)/layout.tsx`
- `frontend/app/(authenticated)/(chat-shell)/workspaces/[workspaceId]/page.tsx`
- `frontend/app/workspaces/[workspaceId]/WorkspaceClient.tsx`
- `frontend/app/workspaces/[workspaceId]/actions.ts`
- `frontend/app/workspaces/[workspaceId]/data.ts`
- `frontend/app/workspaces/[workspaceId]/server-mutations.ts`
- `frontend/app/home/server-data.ts`
- `frontend/app/api/workspaces/route.ts`
- `frontend/app/api/workspaces/[workspaceId]/route.ts`
- `frontend/app/api/conversations/[conversationId]/context/route.ts`
- `frontend/app/home/components/SidePanel.tsx`
- `frontend/lib/workspaces.ts`
- `supabase/migrations/20260719001000_production_schema_baseline.sql`

## Verification

- `frontend/e2e/workspaces.spec.js`
- `frontend/e2e/workspace-performance.spec.js`
- `frontend/__tests__/app/workspace-server-data.test.ts`
- `frontend/__tests__/app/workspaces-route.test.ts`
- `frontend/__tests__/supabase/workspaces-migration.test.ts`
- `supabase/tests/database.sql`

## Related docs

- [Global instructions](./global-instructions.md)
- [Multi-chat home](./multi-chat-home.md)
- [Image attachments](./image-attachments.md)
- [Authentication](./auth-and-route-protection.md)

# Workspaces

Workspaces group related conversations around a subject such as Health, Math 337, Finances, or a project. They sit above Keen in the sidebar and have a dedicated page at `/workspaces/:workspaceId`.

## User Model

A workspace contains:

- sessions, which are conversations scoped to the workspace
- workspace memory, learned only from chats in that workspace
- workspace context, written by the user and applied to every chat in the workspace

Files and links are intentionally deferred.

## Sidebar Behavior

The sidebar keeps existing mentor behavior and adds Workspaces above Keen.

- Clicking a workspace row opens `/workspaces/:workspaceId`.
- Clicking its chevron expands or collapses nested workspace chats.
- Clicking its plus button starts a workspace-scoped draft chat.
- Existing default chats stay under Keen.
- Existing mentor chats stay under their mentor groups.

## Memory Semantics

Default Keen chats read and write global memory.

Workspace chats read global memory plus memory owned by the active workspace. Extracted memories from workspace chats are written only to that workspace with:

- `owner_type = 'workspace'`
- `owner_id = workspace id`

Workspace memory does not appear in default chats, mentor chats, or other workspaces. Automatic promotion from workspace memory to global memory is not part of v1.

## Data Model

`workspaces` stores the workspace name, description, context, icon, accent color, and owner.

`conversations.workspace_id` associates a chat with a workspace. A conversation cannot have both `mentor_id` and `workspace_id`.

`memory_items.owner_type` supports `global`, `mentor`, and `workspace`.

## Routes And APIs

Workspace view:

- `/workspaces/:workspaceId`

Workspace API:

- `GET /api/workspaces`
- `POST /api/workspaces`
- `GET /api/workspaces/:workspaceId`
- `PATCH /api/workspaces/:workspaceId`
- `DELETE /api/workspaces/:workspaceId`

Conversation creation accepts optional `workspaceId` and rejects requests with both `mentorId` and `workspaceId`.

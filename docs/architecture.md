# Architecture

Orchard is a Next.js application whose route handlers also provide the
application API. Supabase owns authentication and durable product state.

## Runtime

```text
Browser
  ├─ Next.js pages and client state
  ├─ Supabase browser client for authenticated storage uploads
  └─ Next.js route handlers
       ├─ Supabase Auth and Postgres
       ├─ configured chat-model providers
       └─ optional Brave and Exa search providers
```

The main application is under `frontend/app/`. Shared server and client logic is
under `frontend/lib/`. There is no separate application backend.

## Main chat flow

1. The client resolves the selected chat, active conversation path, model,
   search mode, response style, and attachments.
2. It creates stable identifiers for the run and optimistic messages.
3. Persistent submissions are accepted into `chat_runs`; temporary submissions
   remain session-scoped on the client.
4. `POST /api/chat` authenticates the request, loads the profile's global
   instructions and relevant conversation path, optionally retrieves search
   sources, and streams the model response.
5. Persistent messages, branches, thread metadata, attachments, and search
   metadata are completed atomically.
6. The client reconciles the streamed result with durable state and can recover
   accepted persistent runs after navigation or reload.

See [Chat run lifecycle](./features/chat-run-lifecycle.md) for the execution
contract.

## Conversation structure

Messages form a tree through `messages.previous_message_id`.
`conversation_branches` records named branch choices rooted at an assistant
message. The UI derives the active transcript from the selected branch at each
fork and exposes the full shape through branch chips and the conversation map.

Inline threads use separate `threads` and `thread_messages` records. A thread is
anchored to selected text in a source message with normalized offsets and a
selection-stream version. This keeps a focused side conversation separate from
the main message tree.

## Persistence

The active migration set in `supabase/migrations/` defines the database source
of truth. Major persisted areas include:

- accounts, profiles, and global instructions
- workspaces and workspace-scoped instructions
- conversations, messages, and branches
- inline threads and thread messages
- message attachment metadata and private Storage objects
- durable chat runs

Row-level security scopes product data to the authenticated user. Chat images
live in the private `chat-images` bucket and are served through an authenticated
route.

Temporary chats are serialized to browser `sessionStorage`. Their prompts still
transit the application server and selected model provider, but their chat
content is not written to the application database.

## Models and search

The AI SDK provides a common streaming interface across configured OpenAI,
Anthropic, Google, and DeepSeek models. Availability is derived from
server-side provider configuration.

Live search has `Off`, `Auto`, and `Always search` modes. When a search runs, the
server classifies the query, retrieves candidates from configured providers,
reranks accepted sources, and stores citation metadata with the response.

## Usage telemetry

Every server-side model-provider invocation finishes through a bounded,
best-effort telemetry recorder. Calls caused by the same user action share a
stable request ID while retaining unique provider-call IDs:

```text
authenticated user action
  └─ stable request ID
       ├─ search decision or plan, when used
       ├─ primary response
       ├─ fallback response, when used
       └─ conversation title, when used
            ↓
       model_usage_calls
            ↓
       service-role-only aggregate functions
            ↓
       authorized, server-rendered /admin
```

Mentor generation uses the same contract with its own request ID and surface.
The writer and admin reader are separate `server-only` modules. They may use the
same service-role credential, but neither exports an unrestricted elevated
client. The admin page authenticates and checks its UUID allowlist before it
creates the reader.

Telemetry contains normalized identifiers, status, timing, token counts, and an
immutable call-time price estimate. It contains no prompt, response, title,
search query, source URL, raw error, or raw provider metadata. Browser roles
cannot read or write the table or execute its aggregates. Telemetry failure is
outside the generation failure boundary, and the no-store admin page consumes
aggregate function results rather than raw call rows.

See [Usage telemetry and administration](./features/telemetry-and-admin.md) for
metric definitions, exclusions, pricing maintenance, and retention behavior.

## Related docs

- [Product](./product.md)
- [Global instructions](./features/global-instructions.md)
- [Inline threads](./features/inline-threads.md)
- [Conversation branching](./features/conversation-branching.md)
- [Usage telemetry and administration](./features/telemetry-and-admin.md)
- [Local setup](./development/setup.md)

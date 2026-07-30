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
Anthropic, Google, DeepSeek, Alibaba, and Moonshot models. Availability is
derived from server-side provider configuration.

Live search has `Off`, `Auto`, and `Always search` modes. When a search runs, the
server classifies the query, retrieves candidates from configured providers,
reranks accepted sources, and stores citation metadata with the response.

## Related docs

- [Product](./product.md)
- [Global instructions](./features/global-instructions.md)
- [Inline threads](./features/inline-threads.md)
- [Conversation branching](./features/conversation-branching.md)
- [Local setup](./development/setup.md)

# Memory

Orchard stores small, structured memory items so relevant facts, preferences,
goals, and constraints can carry across persistent chats.

Memory is supporting context, not a transcript replacement. The server injects
only a bounded, relevant subset into each request.

## User controls

The memory page at `/memory` lists stored items and supports editing and
deletion. Updates are authenticated and row-level security keeps memory scoped
to its owner.

Deleted items are soft-deleted and their embeddings are removed.

## Scopes

- **Global memory** is available to general persistent chats.
- **Workspace memory** is available only inside its workspace.

A workspace chat reads global plus matching workspace memory and writes new
memory to the workspace. A general chat reads and writes global memory.

Temporary chats can read existing memory when `Use existing memories` is
selected, but they never write memory.

## Read path

Before generation, `loadMemoryContextV2()`:

1. loads active items allowed for the chat scope
2. selects stable core-profile items
3. ranks query-relevant items using semantic and lexical similarity
4. considers relevant recent episodic items
5. trims the result to the configured item and token budgets

Semantic retrieval uses OpenAI `text-embedding-3-small` embeddings when
configured. The system falls back to lexical ranking when embeddings are
unavailable.

## Write path

After a persistent assistant response has been committed, a Next.js `after()`
task calls `processMemoryV2()`:

1. analyze recent conversation context and the latest response
2. produce structured memory candidates with type, stability, sensitivity,
   salience, confidence, and action
3. merge exact or near-duplicate items
4. supersede older items when a candidate updates them
5. insert new items and record their source conversation/message
6. update embeddings when configured

Memory work does not block the visible response. Its status is tracked as a
chat-run subsystem.

## Data model

- `memory_items` stores the current structured item and scope.
- `memory_item_sources` records conversation and message provenance.
- `memory_item_embeddings` stores optional vectors used for similarity search.

The active migration set is the schema source of truth.

## Key implementation

- `frontend/lib/memory-items.ts`
- `frontend/lib/memory-items-server.ts`
- `frontend/lib/memory-reader.ts`
- `frontend/lib/memory-agent.ts`
- `frontend/app/api/memory/items/route.ts`
- `frontend/app/api/memory/items/[id]/route.ts`
- `frontend/app/memory/page.tsx`

## Verification

- `frontend/__tests__/lib/memory-items.test.ts`
- `frontend/__tests__/lib/memory-integration.test.ts`
- `frontend/__tests__/app/memory-items-routes.test.ts`
- memory cases in `frontend/__tests__/app/chat-route.test.ts`

## Related docs

- [Workspaces](./workspaces.md)
- [Temporary chats](./temporary-chat.md)
- [Chat run lifecycle](./chat-run-lifecycle.md)

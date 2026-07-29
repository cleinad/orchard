# Chat Run Lifecycle

The chat-run system coordinates main replies, branches, and inline-thread
replies across streaming, navigation, cancellation, persistence, and recovery.

## Shared protocol

Before submission, the client creates stable UUIDs for:

- the run
- the user message
- the assistant message
- a new branch or thread when applicable

Every run targets one scope:

- main chat path
- branch rooted at an assistant message
- inline thread

The target also records the expected predecessor. This lets the server reject
conflicting writes instead of attaching a response to the wrong path.

## States

Runs move through:

```text
queued → submitting → streaming → finalizing → completed
```

They may instead become `failed`, `cancelled`, or `interrupted`.

Response, title, and search are tracked as separate subsystems because the
visible answer may finish before background work.

## Persistent runs

Persistent runs are recorded in `chat_runs` once accepted by the server.

- Reusing the same identifiers is idempotent.
- The server validates target ownership and predecessor state.
- The final response and related persistent records are completed atomically.
- Navigation or a broken stream does not cancel accepted server work.
- The client polls `/api/chat-runs/<runId>` to reconcile an accepted run whose
  stream was lost.
- Stored client snapshots reconnect runs to the relevant main chat, branch, or
  thread after navigation or reload.

A short grace period distinguishes a run that has not appeared yet from a
request that was never accepted.

## Temporary runs

Temporary runs use the same client snapshot shape but have no remote run record.
Snapshots live in `sessionStorage`, and generation is tied to the current
browser session.

Closing a temporary chat aborts its active local runs and removes their stored
snapshots. An interrupted temporary run cannot be recovered from the server.

## Cancellation

Stop requests abort active local streaming and, for accepted persistent runs,
call the server cancellation route. Terminal state is monotonic: a late
non-cancelled snapshot cannot overwrite a cancelled result.

Cancellation is best effort around provider and finalization boundaries. The
client reconciles persistent state after the request so it can display what the
server actually committed.

## Titles and background work

The first prompt creates a fallback title immediately. Generated titles carry
run provenance and a version so older completion work cannot overwrite a newer
or user-owned title.

Search metadata is finalized with the assistant response.

## Key implementation

- `frontend/app/components/ChatRunCoordinator.tsx`
- `frontend/lib/chat-runs/protocol.ts`
- `frontend/lib/chat-runs/reconciliation.ts`
- `frontend/lib/chat-runs/server.ts`
- `frontend/lib/chat-runs/storage.ts`
- `frontend/app/api/chat-runs/[runId]/route.ts`
- `frontend/app/api/chat-runs/[runId]/cancel/route.ts`
- `frontend/app/api/chat/route.ts`

## Verification

- `frontend/e2e/chat-run-lifecycle.spec.js`
- `frontend/__tests__/app/chat-runs-route.test.ts`
- `frontend/__tests__/lib/chat-run-protocol.test.ts`
- `frontend/__tests__/lib/chat-run-reconciliation.test.ts`
- `frontend/__tests__/lib/chat-run-storage.test.ts`

## Related docs

- [Multi-chat home](./multi-chat-home.md)
- [Temporary chats](./temporary-chat.md)
- [Conversation branching](./conversation-branching.md)
- [Inline threads](./inline-threads.md)

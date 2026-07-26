# Chat Run Lifecycle

## Purpose

`ChatRunCoordinator` owns a run above routed chat views, so switching chats or navigating elsewhere in the app detaches the view without cancelling generation. Persistent and temporary chats share identifiers, targeting, UI states, and Stop behavior, but deliberately use different persistence adapters.

The abstraction is intentionally narrow. It does not merge persistent conversation state with temporary session state, and it does not force storage symmetry.

## Shared protocol

Every coordinated submission has client-generated UUIDs for the run, user message, assistant message, and any new branch or inline thread. The lifecycle is:

`queued → submitting → streaming → finalizing → completed`

Exceptional states are `failed`, `cancelled`, and `interrupted`. Response, title, search, and memory have independent subsystem statuses. The immutable target identifies the chat, main/branch/thread path, source message, and expected predecessor.

Switching views never implies cancellation. Only the explicit Stop action cancels a run.

## Mode-specific behavior

| Event | Persistent chat | Temporary chat |
| --- | --- | --- |
| Switch chats or leave `/home` | Continues | Continues while the root coordinator and connection remain alive |
| Reload after completion | Reload durable transcript | Restore the locally completed session from `sessionStorage` |
| Reload during generation | Reconcile by `runId` | Mark the local run `interrupted`; do not resubmit automatically |
| Network interruption | Reconcile the authoritative server run | Mark `interrupted` when the live stream cannot continue |
| Explicit Stop | Server cancellation prevents assistant commit | Abort the browser request and remove the local placeholder |
| Close tab | Server run remains reconnectable | Existing browser/session restoration behavior only |

Exact token replay is not implemented. Persistent reconciliation obtains the authoritative final snapshot.

## Persistent adapter

Persistent runs use `chat_runs` and `chat_run_events`:

- canonical payload hashing and idempotent acceptance by `runId`
- server-enforced one-active-run-per-path concurrency
- independently consumed response streams
- atomic assistant message commit and terminal run completion
- database-backed response, title, search, and memory states
- reconciliation after reload or connection loss
- content-free lifecycle events keyed by `runId`

Reusing a `runId` with a different payload returns `payload_conflict`. A stale predecessor returns `stale_target`; an occupied path returns `active_conflict`.

## Temporary adapter and privacy boundary

Temporary runs are browser-owned. The server processes the live request but does not write temporary content or run state to Supabase Postgres or another remote database.

The temporary path does not write:

- conversations, messages, threads, or branches
- chat run or lifecycle event tables
- titles or search results
- memory or embeddings

Temporary IDs remain useful for local targeting and deduplication. Duplicate submission is prevented within the current coordinator context, but cross-instance idempotency and server reconciliation are intentionally not promised. An ambiguous temporary failure is never automatically retried because doing so could duplicate a model call.

Temporary titles are generated in parallel from the first prompt and returned through the live stream. The generated title or local fallback is retained only in the temporary session. Temporary search telemetry omits prompt-derived hashes, previews, and error text. Prompts still transit the application server, search providers when search is used, and the selected model provider; “not persisted” does not mean “never leaves the device.”

Temporary image attachments retain the pre-existing behavior documented in [Image Attachments](./image-attachments.md): they are uploaded to private Supabase Storage so the server can send their bytes to the model, and explicit temporary-chat close best-effort deletes them. They are not represented in Postgres. A tab closed mid-request can still leave an orphaned object; durable orphan cleanup remains a separate attachment hardening task.

## Titles

Persistent title generation begins in parallel from the first prompt. Titles carry `fallback`, `generated`, or `user` provenance plus a version and generating run ID. A generated title commits only while the conversation remains at the expected fallback version, so delayed work cannot overwrite a manual title or a newer eligible run.

Temporary titles use the same generation trigger but never use the title endpoint or database fields.

## Deferred work

Sequence-numbered SSE replay remains deferred. It should be added only if production evidence shows that final-state reconciliation is insufficient for persistent chats. It would not change the intentional privacy limitation for temporary chats.

## Behavior checklist

This checklist is the regression contract for the coordinator. “Recover” means resolving the authoritative partial or final snapshot by `runId`; exact token replay is not required.

### Persistent chats

- [x] A new local run is not reconciled until `/api/chat` acknowledges it.
- [x] A first send appears in the sidebar and route immediately while retaining a session-local recovery draft until server acceptance.
- [x] A confirmed pre-acceptance rejection restores the editable draft; an ambiguous result keeps reconciling instead of rolling back.
- [x] Switching chats or creating another chat detaches the view without cancelling the run.
- [x] Navigation outside `/home` leaves generation running and restores the result on return.
- [x] Reload before acknowledgement reconciles the same `runId` without another model call.
- [x] Reload or reconnect after acknowledgement recovers an authoritative run snapshot.
- [x] A typed lookup failure remains `interrupted` and recoverable; it is not reported as a missing run.
- [x] A confirmed missing run is shown only after a bounded grace period.
- [x] Stop before acknowledgement waits through the acceptance window, cancels on the server, and does not strand local loading UI.
- [x] Stop after acknowledgement cancels through the same explicit endpoint.
- [x] Repeating a submission uses the same client IDs and server idempotency; payload conflicts do not start a model call.
- [x] Concurrent runs on the same path tail are rejected server-side, while independent chats may run concurrently.
- [x] Main, branch, and inline-thread targets retain their validated conversation and path identifiers through background completion.
- [x] Response completion remains independent from title, search, and memory subsystem failures.
- [x] Delayed generated titles cannot overwrite a user title or a newer title version.
- [x] Framework HTML 404s, database lookup failures, and cancellation failures remain distinct from a typed `run_not_found` response.

### Temporary chats

- [x] Switching chats or navigating elsewhere in the app keeps the live browser-owned run going.
- [x] A completed response and generated/fallback title survive same-tab reload through `sessionStorage`.
- [x] Reload during generation becomes one local `interrupted` result and never resubmits automatically.
- [x] An ambiguous network failure becomes `interrupted` and never retries the model call automatically.
- [x] Repeated Enter while the run is active starts one request.
- [x] Stop aborts locally and never calls the persistent cancellation or reconciliation APIs.
- [x] Main, branch, and inline-thread IDs remain locally targeted without database run mutations.
- [x] Temporary title failure falls back locally without failing the response.
- [x] Temporary runs do not invoke memory extraction or write run, event, title, message, thread, or branch rows.
- [x] Closing the tab may end active temporary generation. Completed-session recovery is limited to the browser's existing `sessionStorage` lifetime.

### Error presentation and observability

- [x] Run failures render as error/status rows, not assistant answers, and do not expose Copy or Branch actions.
- [x] Restored temporary errors retain that presentation after reload.
- [x] Lifecycle events are content-free and keyed by `runId`.
- [x] Reconciliation records one initial client reconciliation event rather than one event per poll.
- [x] Accepted, disconnected, generated, assistant-committed, title-committed, reconciled, failed, and cancelled transitions are observable independently.

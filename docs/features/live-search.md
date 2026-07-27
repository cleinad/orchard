# Live Search

Live search optionally grounds a response in fresh external sources and stores
the accepted sources with that response.

## User modes

- **Off:** do not run live retrieval. This is the default.
- **Auto:** decide whether current external information would materially improve
  the answer.
- **Always search:** run retrieval before answering.

The setting is kept per chat in browser session state. Inline-thread requests
inherit the active chat's mode.

## Execution

When search runs:

1. Resolve the search query from the prompt and recent context.
2. Classify it into a retrieval profile.
3. Request candidates from the configured Brave and Exa providers.
4. Normalize, deduplicate, relevance-filter, and rerank candidates.
5. Build an evidence block for answer generation.
6. Parse inline citation markers and persist source metadata with the response.

Search profiles cover fresh web information, research-oriented evidence,
official sources, and web/social intent. Routing is deterministic; when a
compatible planner model is configured, it can refine the Auto decision and
query plan within a validated schema.

## Sources and citations

Accepted sources store:

- stable source ID
- title, URL, domain, and optional favicon
- provider and source type
- snippet and ranking metadata

Assistant citation markers map to those source IDs. The transcript renders
inline citation controls and a response-attached source tray. Raw citation
markers are stripped before assistant text is reused for memory, previews, and
later model context.

## Failure behavior

Auto failures are silent to the user: Orchard answers without search and logs
the failure.

Always search failures or missing configuration produce a disclosure that the
answer could not be grounded with live results. A partial provider failure may
still produce a sourced answer when another provider succeeds.

Search uses timeouts, relevance gates, query limits, and server-side telemetry.
Secrets and full private prompt context must not be written to logs.

## Persistence

Persistent response metadata is stored on the assistant message in
`messages.search_metadata`.

Temporary chats keep the same metadata shape in browser session state and do
not write it to the database.

## Key implementation

- `frontend/lib/chat-search.ts`
- `frontend/lib/search/orchestrator.ts`
- `frontend/lib/search/query-planner.ts`
- `frontend/lib/search/pipeline.ts`
- `frontend/lib/search/providers/`
- `frontend/lib/search-citations.ts`
- `frontend/app/home/components/SearchSourcesTray.tsx`
- `frontend/app/home/components/InlineCitation.tsx`

## Verification

- `frontend/__tests__/app/chat-route-search.test.ts`
- `frontend/__tests__/lib/search-*.test.ts`
- `frontend/e2e/search-mode.spec.js`
- [Search tuning playbook](../testing/search-tuning-playbook.md)

## Related docs

- [Local setup](../development/setup.md)
- [Memory](./memory.md)
- [Temporary chats](./temporary-chat.md)

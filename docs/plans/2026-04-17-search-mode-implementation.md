# Search Mode Implementation Plan

Date: 2026-04-17

References:

- [Approved design spec](../superpowers/specs/2026-04-17-search-mode-design.md)
- [Current live-search feature doc](../features/live-search.md)

## Scope

This plan covers the approved search-mode redesign:

- replace Tavily with a provider-agnostic search pipeline
- make search explicit-only
- ship `Brave + Exa` as the v1 retrieval stack
- upgrade persisted `search_metadata` to a v2 payload
- update the source UI so larger source sets remain usable

`X` is included as a deferred follow-up task after the core web and research pipeline is stable.

## Implementation Notes

- Keep `public.messages.search_metadata` as `jsonb`. No migration is required for v1.
- Maintain backward compatibility when reading legacy v1 metadata already stored on messages.
- During implementation, verify provider request and response details against the official `Brave`, `Exa`, and `X` API docs before wiring each client.
- Commands below assume the working directory is `frontend/` unless noted otherwise.

## File Map

### Existing Files To Modify

- `frontend/app/api/chat/route.ts`
  Owns search execution, grounded prompt construction, disclosures, persistence, and reply generation.
- `frontend/lib/chat-search.ts`
  Owns the response-level search envelope, warnings, and disclosure text.
- `frontend/lib/search-citations.ts`
  Owns persisted metadata parsing, creation, source normalization, and citation cleanup.
- `frontend/app/home/[[...conversationId]]/page.tsx`
  Owns `searchEnabled` state, request payload construction, and the last-reply search status banner.
- `frontend/app/home/components/ChatComposer.tsx`
  Owns the visible search toggle copy and tooltip text.
- `frontend/app/home/components/SearchSourcesTray.tsx`
  Owns the per-reply source UI.
- `frontend/app/home/components/MarkdownWithThreads.tsx`
  Owns citation chip rendering and reply-level source interactions.
- `frontend/app/home/components/useHomeData.ts`
  Owns persisted message loading and sidebar preview stripping.
- `frontend/app/home/types.ts`
  Owns main conversation message types.
- `frontend/app/home/components/threadTypes.ts`
  Owns thread message types.
- `frontend/app/api/threads/[threadId]/messages/route.ts`
  Owns thread message fetches including `search_metadata`.
- `frontend/__tests__/app/chat-route.test.ts`
  Covers `/api/chat` behavior beyond search-specific assertions.
- `frontend/__tests__/app/chat-route-search.test.ts`
  Covers the search pipeline behavior in `/api/chat`.
- `frontend/__tests__/lib/search-citations.test.ts`
  Covers metadata parsing and citation helper behavior.
- `docs/features/live-search.md`
  Current feature source of truth for live search behavior.
- `docs/testing/search-citations-and-source-ui.md`
  Current test guide for search citations and source UI.

### New Files To Create

- `frontend/lib/search/types.ts`
  Shared provider, profile, candidate, and pipeline result types.
- `frontend/lib/search/router.ts`
  Deterministic query router.
- `frontend/lib/search/providers/brave.ts`
  Brave client and result normalization.
- `frontend/lib/search/providers/exa.ts`
  Exa client and result normalization.
- `frontend/lib/search/rerank.ts`
  Deterministic reranking logic.
- `frontend/lib/search/pipeline.ts`
  Provider orchestration, dedupe, rerank, and final evidence set assembly.
- `frontend/__tests__/lib/search-router.test.ts`
  Router classification coverage.
- `frontend/__tests__/lib/search-pipeline.test.ts`
  Pipeline, fallback, dedupe, and ranking coverage.
- `frontend/e2e/search-mode.spec.js`
  End-to-end coverage for explicit-only search mode and larger source trays.

### Existing Files To Remove Or Retire

- `frontend/lib/tools.ts`
  Retire the Tavily-specific search entrypoint once all callers move to `frontend/lib/search/pipeline.ts`.

## Task Sequence

### Task 1: Add Shared Search Types And Metadata V2 Compatibility

**Files:**
- Create: `frontend/lib/search/types.ts`
- Modify: `frontend/lib/search-citations.ts`
- Modify: `frontend/lib/chat-search.ts`
- Test: `frontend/__tests__/lib/search-citations.test.ts`

- [ ] Add or update targeted test coverage for:
  - parsing legacy v1 metadata
  - creating v2 metadata
  - accepting `partial` status
  - preserving citation behavior with larger visible source sets
- [ ] Introduce shared search enums and types for:
  - profiles
  - providers
  - source types
  - pipeline result statuses
- [ ] Update `search-citations.ts` to read old v1 rows and emit the new v2 payload for new writes.
- [ ] Remove the hard persisted-source cap while preserving stable numeric ids and duplicate URL handling.
- [ ] Update `chat-search.ts` so response metadata, warnings, and disclosures understand the new v2 statuses without breaking older messages.
- [ ] Run `npm run test -- __tests__/lib/search-citations.test.ts`
- [ ] Verify legacy persisted rows still parse and newly created metadata supports `profile`, `providers`, and provider-specific source details.
- [ ] Commit with `refactor: add search metadata v2`

### Task 2: Implement The Deterministic Search Router

**Files:**
- Create: `frontend/lib/search/router.ts`
- Modify: `frontend/lib/search/types.ts`
- Test: `frontend/__tests__/lib/search-router.test.ts`

- [ ] Add router tests for:
  - `fresh_web` freshness queries
  - `research_backed` evidence and studies queries
  - `official_priority` docs, release notes, and filings queries
  - `web_social` reaction and sentiment queries
  - explicit override phrases such as `official sources only` and `what are people saying`
- [ ] Implement a deterministic scorer that classifies the latest query without using `generateObject()` or any secondary LLM.
- [ ] Keep the router interface narrow: input query string, optional normalized tokens, output primary profile plus provider hints.
- [ ] Run `npm run test -- __tests__/lib/search-router.test.ts`
- [ ] Verify routing precedence matches the approved spec and is easy to log/debug.
- [ ] Commit with `feat: add deterministic search router`

### Task 3: Add Brave And Exa Provider Clients Plus The Core Search Pipeline

**Files:**
- Create: `frontend/lib/search/providers/brave.ts`
- Create: `frontend/lib/search/providers/exa.ts`
- Create: `frontend/lib/search/rerank.ts`
- Create: `frontend/lib/search/pipeline.ts`
- Modify: `frontend/lib/search/types.ts`
- Test: `frontend/__tests__/lib/search-pipeline.test.ts`

- [ ] Add pipeline tests for:
  - parallel provider retrieval
  - provider fallback when one backend fails
  - deduplication of repeated URLs or repeated story variants
  - authority ranking where official sources outrank random blogs
  - research ranking where papers or institutional sources outrank forums
  - visible-source selection that preserves stable ids across the final set
- [ ] Implement provider adapters that:
  - sanitize requests and responses
  - normalize results into the shared candidate shape
  - enforce timeouts and provider-specific failure statuses
- [ ] Implement pipeline orchestration that:
  - selects providers from the router output
  - runs provider calls in parallel
  - deduplicates candidates
  - reranks deterministically
  - produces both a synthesis pool and a visible persisted source set
- [ ] Keep provider configuration isolated to env-backed clients such as `BRAVE_API_KEY` and `EXA_API_KEY`.
- [ ] Run `npm run test -- __tests__/lib/search-pipeline.test.ts`
- [ ] Verify the pipeline can return `success`, `partial`, `no_results`, and provider-failure outcomes without collapsing the answer path.
- [ ] Commit with `feat: add brave and exa search pipeline`

### Task 4: Replace The Tavily Route Path With Explicit-Only Search

**Files:**
- Modify: `frontend/app/api/chat/route.ts`
- Modify: `frontend/lib/chat-search.ts`
- Modify: `frontend/lib/search-citations.ts`
- Modify: `frontend/__tests__/app/chat-route.test.ts`
- Modify: `frontend/__tests__/app/chat-route-search.test.ts`
- Delete: `frontend/lib/tools.ts`

- [ ] Update route tests so they cover:
  - `searchEnabled = false` never triggers retrieval
  - `searchEnabled = true` always triggers the new pipeline
  - no `generateObject()` planner call is used for search routing
  - `partial` results persist v2 metadata and still ground the answer
  - provider failures fall back to a disclosed non-grounded answer when necessary
- [ ] Replace `runWebSearch()` usage with the new search pipeline entrypoint.
- [ ] Remove the `auto` planner branch from `/api/chat` search behavior while keeping old message metadata readable.
- [ ] Preserve existing request-context rules:
  - user name
  - server-derived local time
  - citation stripping for memory reuse
- [ ] Ensure the grounded prompt only includes the reranked evidence set, not raw provider output.
- [ ] Remove the old Tavily helper file once all imports are migrated.
- [ ] Run `npm run test -- __tests__/app/chat-route.test.ts __tests__/app/chat-route-search.test.ts`
- [ ] Verify searched replies still persist citations, disclosures, and sanitized assistant text for memory extraction.
- [ ] Commit with `feat: switch chat route to explicit search pipeline`

### Task 5: Update Home-Surface State And Toggle Copy For Explicit Search

**Files:**
- Modify: `frontend/app/home/[[...conversationId]]/page.tsx`
- Modify: `frontend/app/home/components/ChatComposer.tsx`
- Modify: `frontend/app/home/types.ts`
- Modify: `frontend/app/home/components/threadTypes.ts`
- Modify: `frontend/app/home/components/useHomeData.ts`
- Modify: `frontend/app/api/threads/[threadId]/messages/route.ts`
- Test: `frontend/e2e/search-mode.spec.js`

- [ ] Add end-to-end coverage for:
  - normal chat keeping search off by default
  - the search toggle enabling explicit search mode
  - last-reply source status using the new explicit-search wording
  - stored replies reloading with their persisted metadata intact
- [ ] Update the toggle copy, aria labels, and helper text so the UX communicates a simple on/off `Search` mental model rather than `Auto / Always on`.
- [ ] Keep the `searchEnabled` request field, but treat it as explicit search on/off only.
- [ ] Verify conversation and thread message loaders continue to carry the richer metadata shape to the UI.
- [ ] Run `npm run test:e2e -- e2e/search-mode.spec.js`
- [ ] Verify the composer, last-search banner, and reload behavior all match the new feature wording.
- [ ] Commit with `feat: simplify search mode ui`

### Task 6: Scale The Source UI For Larger Evidence Sets

**Files:**
- Modify: `frontend/app/home/components/SearchSourcesTray.tsx`
- Modify: `frontend/app/home/components/MarkdownWithThreads.tsx`
- Modify: `frontend/app/home/[[...conversationId]]/page.tsx`
- Test: `frontend/e2e/search-mode.spec.js`

- [ ] Extend end-to-end coverage so one searched reply exercises `10+` visible sources and verifies the tray remains navigable.
- [ ] Replace the current small tab row assumption with a list- or card-based source selector that scales to larger visible sets.
- [ ] Preserve current behaviors:
  - clicking a citation opens the source surface
  - citation ids remain stable
  - `Open source` still launches the stored URL
  - only successful searched replies render source controls
- [ ] Keep the UI compact and reply-attached rather than introducing a modal viewer.
- [ ] Run `npm run test:e2e -- e2e/search-mode.spec.js`
- [ ] Verify the tray remains readable and responsive with `6-12+` sources.
- [ ] Commit with `feat: scale search source tray`

### Task 7: Update Search Docs And Test Docs

**Files:**
- Modify: `docs/features/live-search.md`
- Modify: `docs/testing/search-citations-and-source-ui.md`
- Modify: `docs/README.md`

- [ ] Update the feature doc so it no longer describes planner-driven auto search or Tavily-specific behavior.
- [ ] Document the new explicit-only search rule, router profiles, `Brave + Exa` provider stack, v2 metadata contract, and larger source UI expectations.
- [ ] Refresh the testing doc with:
  - new targeted unit tests
  - new e2e command
  - manual verification for official-source prioritization and larger source sets
- [ ] Update `docs/README.md` so the feature reference for live search clearly points readers to the revised explicit-search behavior and provider-backed source model.
- [ ] Verify all referenced file paths and commands are valid.
- [ ] Commit with `docs: update search mode docs`

### Task 8: Add X As A Deferred Social Augmentation Phase

**Files:**
- Create: `frontend/lib/search/providers/x.ts`
- Modify: `frontend/lib/search/router.ts`
- Modify: `frontend/lib/search/pipeline.ts`
- Modify: `frontend/lib/search/types.ts`
- Modify: `frontend/__tests__/lib/search-router.test.ts`
- Modify: `frontend/__tests__/lib/search-pipeline.test.ts`
- Modify: `frontend/__tests__/app/chat-route-search.test.ts`
- Modify: `docs/features/live-search.md`

- [ ] Add tests for:
  - social-intent routing to `web_social`
  - `Brave + X` combined retrieval
  - demotion of `X` for factual claims
  - fallback behavior when `X` is unavailable
- [ ] Implement the `X` provider adapter only after the Brave and Exa pipeline is stable in development.
- [ ] Keep `X` optional and provider-gated so its failure never blocks a search-mode answer.
- [ ] Run `npm run test -- __tests__/lib/search-router.test.ts __tests__/lib/search-pipeline.test.ts __tests__/app/chat-route-search.test.ts`
- [ ] Verify social evidence enters the final set only for reaction- or discourse-oriented queries.
- [ ] Commit with `feat: add x search augmentation`

## Verification Matrix

Use this sequence as the final verification pass after Tasks 1-7:

1. `npm run test -- __tests__/lib/search-citations.test.ts __tests__/lib/search-router.test.ts __tests__/lib/search-pipeline.test.ts`
2. `npm run test -- __tests__/app/chat-route.test.ts __tests__/app/chat-route-search.test.ts`
3. `npm run test:e2e -- e2e/search-mode.spec.js`
4. `npm run lint -- app/api/chat/route.ts lib/chat-search.ts lib/search-citations.ts lib/search app/home/[[...conversationId]]/page.tsx app/home/components/ChatComposer.tsx app/home/components/SearchSourcesTray.tsx app/home/components/MarkdownWithThreads.tsx app/home/components/useHomeData.ts app/home/types.ts app/home/components/threadTypes.ts app/api/threads/[threadId]/messages/route.ts`

Manual checks:

- ask a current-events question with search off and confirm no retrieval is attempted
- repeat with search on and confirm retrieval always occurs
- ask for an official product update and confirm official sources outrank blogs
- ask an evidence-heavy question and confirm research-quality sources appear
- reload a searched conversation and confirm citations and source UI persist
- inspect a reply with many sources and confirm the tray stays usable

## Plan Self-Check

- Every approved design requirement maps to at least one task.
- The plan keeps the first shippable slice to `Brave + Exa`, with `X` intentionally deferred.
- Existing `search_metadata` storage is preserved, avoiding unnecessary schema work.
- Tasks are small enough to land in focused commits without mixing docs, backend, UI, and deferred-provider work indiscriminately.

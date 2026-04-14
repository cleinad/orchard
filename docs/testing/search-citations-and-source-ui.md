# Search Citations Testing

This doc describes the current automated coverage, focused canary, and manual verification path for persistent search citations and the minimal source UI on `/home`.

Companion docs:

- [Live Search](../features/live-search.md)
- [Search Citations And Source UI](../plans/2026-04-11-search-citations-and-source-ui-plan.md)

## Current Automated Coverage

- `frontend/__tests__/app/chat-route-search.test.ts`
- `frontend/__tests__/lib/search-citations.test.ts`
- `frontend/__tests__/app/chat-route.test.ts` as supporting `/api/chat` contract coverage

The automated suite currently verifies:

- persisted search metadata is normalized with stable numeric source ids and server-derived domains
- malformed persisted metadata is rejected during parsing
- valid citation markers like `[1] [2]` split into separate compact citation parts
- valid citation markers are stripped before assistant text is reused for memory/context
- invalid citation markers are stripped while valid ones are preserved
- `/api/chat` planner requests receive the same concise request context used for answer generation, including the saved user name and current local time
- answer generation receives the same concise request context, with local time derived server-side from the request timezone
- `auto` mode with no search persists `search_metadata = null`
- `required` mode with a successful search persists normalized `search_metadata`
- invalid citation ids are removed before the assistant message is saved
- memory extraction receives assistant text without citation-marker noise

## Focused Canary

From `frontend/`:

```bash
npm run test -- __tests__/app/chat-route.test.ts __tests__/app/chat-route-search.test.ts __tests__/lib/search-citations.test.ts
```

Run broader suites only if your change spills outside live search, citations, or `/api/chat`.

## Manual Verification

Use these checks when changing the citation UI or persistence path:

- Ask a time-sensitive question such as "what time is it?" and confirm the reply uses the current local time for the browser timezone, not a model guess.
- Send a reply in `Always on` mode and confirm successful search replies show compact clickable citation chips.
- Click a citation chip and confirm the inline source tray opens under that reply.
- Click `Sources N` and confirm the same tray opens even when no chip is selected.
- Switch between source ids in the tray and confirm the title, domain, snippet, and `Open source` link update.
- Reload the conversation and confirm the same newly generated reply still has citation chips and the source tray still works.
- Confirm older replies with no `search_metadata` render without empty citation controls.
- Confirm conversation previews in the sidebar do not show raw `[1]` markers.

## Current Gaps

- There is no dedicated rendering unit test yet for `MarkdownWithThreads` citation chips or `SearchSourcesTray`.
- There is no Playwright coverage yet for citation chip clicks, tray behavior, or reload persistence.
- The suite does not exercise live Tavily calls in CI; route tests stay deterministic with mocked search output.
- The current implementation does not backfill old messages with citation metadata, so historical replies remain outside the scope of this suite.

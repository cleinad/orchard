# Search Citations Testing

This doc covers the current automated checks, focused commands, and manual verification path for explicit search mode, persisted citations, and the reply-level source UI on `/home`.

Companion docs:

- [Search Mode](../features/live-search.md)
- [Search Mode Design](../superpowers/specs/2026-04-17-search-mode-design.md)
- [Search Tuning Playbook](./search-tuning-playbook.md)

## Current Automated Coverage

- `frontend/__tests__/lib/search-citations.test.ts`
- `frontend/__tests__/lib/search-telemetry.test.ts`
- `frontend/__tests__/lib/search-router.test.ts`
- `frontend/__tests__/lib/search-pipeline.test.ts`
- `frontend/__tests__/app/chat-route.test.ts`
- `frontend/__tests__/app/chat-route-search.test.ts`
- `frontend/e2e/search-mode.spec.js`

The automated suite now verifies:

- legacy v1 `search_metadata` still parses
- new v2 `search_metadata` is normalized with provider, profile, and source-type details
- valid citation markers like `[1] [2]` split into separate compact parts
- citation markers are stripped before assistant text is reused for memory or future context
- `partial` grounded results still count as usable source-backed metadata
- deterministic router classification for freshness, research, official-priority, and social-intent queries
- pipeline fallback, dedupe, and reranking behavior
- telemetry query redaction in production and structured search event payloads
- official sources outrank random blogs in the final evidence set
- research sources outrank forums for evidence-heavy queries
- `/api/chat` never uses planner-driven auto search anymore
- `searchEnabled = false` persists `search_metadata = null`
- `searchEnabled = true` persists normalized v2 search metadata
- invalid citation ids are stripped before the assistant message is saved
- the home surface can send an explicit search request and render a larger source tray

## Focused Commands

From `frontend/`:

```bash
npm run test -- __tests__/lib/search-citations.test.ts __tests__/lib/search-router.test.ts __tests__/lib/search-pipeline.test.ts
npm run test -- __tests__/lib/search-telemetry.test.ts
npm run test -- __tests__/app/chat-route.test.ts __tests__/app/chat-route-search.test.ts
npm run test:e2e -- e2e/search-mode.spec.js
```

Run the e2e spec when the search toggle behavior, persisted reply metadata, or source tray UI changes.

## Manual Verification

Use these checks when changing the search pipeline or citation UI:

- Ask a time-sensitive question with search off and confirm the reply uses the current local time for the browser timezone without doing retrieval.
- Turn search on and ask a current-events or product-update question; confirm the reply is grounded and the request surfaces `Sources N`.
- Ask an official-source-heavy query such as product pricing or release notes and confirm official pages outrank random blogs.
- Ask an evidence-heavy query and confirm the visible source set includes stronger research or institutional sources.
- Click a citation chip and confirm the reply-level source tray opens under that reply.
- Click `Sources N` and confirm the same tray opens without requiring a citation click.
- Navigate between multiple entries in the tray and confirm the detail panel updates.
- Reload the conversation and confirm citations and the source tray still work.
- Confirm older replies with no `search_metadata` render without empty citation controls.
- Confirm sidebar previews and TTS do not expose raw `[1]` markers.

## Current Gaps

- There is still no dedicated unit test for `SearchSourcesTray` or `ConversationView`; current UI confidence comes from e2e coverage plus the citation helper tests.
- The suite does not hit live Brave or Exa APIs in CI; provider behavior is covered with deterministic mocks.
- Live-provider smoke testing and latency tuning still need to be done manually with real API keys before search mode can be considered production-tuned.
- Search telemetry is currently server-log based only; there is no durable analytics table for historical search inspection yet.
- `X` integration is intentionally out of scope until the `Brave + Exa` stack is stable.

# Search Citations Testing

This doc describes the planned coverage for persistent search citations and the minimal source UI on `/home`.

Companion design doc:

- [Search Citations And Source UI](../plans/2026-04-11-search-citations-and-source-ui-plan.md)

## What It Covers

- server-side search metadata normalization
- citation marker validation and stripping
- chat-route persistence of per-message `search_metadata`
- frontend citation-chip rendering
- inline source-tray behavior
- persistence across reload for newly generated replies

## How To Run

From `frontend/`:

- `npm run test`
- `npm run test:e2e`
- `npm run test:e2e:ui`

## Unit Coverage

Add unit tests around the citation/search helpers.

Key coverage:

- search result normalization
- domain extraction from source URLs
- source dedupe while preserving stable numeric ids
- short-snippet truncation and sanitization
- parsing valid citation markers such as `[1] [3]`
- leaving invalid markers as plain text
- stripping citation markers from assistant text before memory/context reuse
- validating that cited ids are present in persisted `sources[]`

## Route Coverage

Extend route tests around `/api/chat`.

Key cases:

- `required` mode with successful search persists `search_metadata`
- `required` mode with failed search returns a normal reply without source UI metadata
- `auto` mode planner decides no search and persists `search_metadata = null`
- `auto` mode planner decides search, runs search once, and persists normalized sources
- returned response metadata matches the saved message metadata for the new assistant reply
- invalid citation ids are stripped or repaired before save
- memory extraction receives assistant text without citation-marker noise

## Rendering Coverage

Add frontend rendering tests for reply-level citation behavior.

Key cases:

- `[1] [3]` becomes two separate compact citation chips
- `[1,3]` is not synthesized automatically by the UI
- citation ids not present in `sources[]` remain plain text
- replies with `search_metadata.status === 'success'` show a subtle `Sources N` affordance
- replies with sources but no inline citations still expose the source tray through the footer affordance
- replies without `search_metadata` render exactly as before

## Browser Coverage

Add Playwright coverage for the end-user interaction.

Key regression cases:

- send a grounded reply, click `[1]`, and verify the minimal source tray opens under that reply
- click a different citation such as `[3]` and verify the same tray switches focus to the selected source
- click the active citation again and verify the tray closes
- click `Sources N` and verify the tray opens even if no citation chip is selected
- use the tray’s `Open source` link and verify it points to the stored URL
- reload the conversation and verify the same new reply still has clickable citations
- verify only one reply’s source tray can be open at a time
- verify mobile viewport behavior keeps the tray inline rather than opening a large modal

## Fixture And Mocking Strategy

Prefer deterministic tests over live search calls.

- route tests should mock planner output and normalized search results
- rendering tests should pass explicit message objects with persisted `searchMetadata`
- browser tests should mock `/api/chat` responses with realistic assistant text plus `search_metadata`

This keeps the suite focused on deterministic citation behavior instead of external Tavily availability.

## Backward-Compatibility Checks

Add explicit coverage for legacy messages.

- old messages with no `search_metadata` should not break markdown rendering
- old conversations should not show empty source trays
- citation parsing must not interfere with existing inline-thread rendering

## Intentional Gaps

The v1 test plan does not require:

- backfilling citation metadata for old messages
- full historical search-query browsing
- analytics on citation click-through
- testing against live Tavily in CI

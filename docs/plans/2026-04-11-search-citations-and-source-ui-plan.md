# Search Citations And Source UI

## What This Doc Covers

This doc describes the approved v1 design for persistent search citations on `/home`.

It focuses on:

- clickable inline citation markers inside assistant replies
- a minimal per-reply source tray
- persistent source metadata for new grounded replies
- a server-owned search pipeline that keeps source numbering stable
- memory/context hygiene so citation plumbing does not pollute future prompts

Companion testing doc:

- [Search Citations Testing](../testing/search-citations-and-source-ui.md)

This is a design and implementation-shape doc. It does not include code changes.

## Goals

- make source-backed citations actually clickable
- keep the source UI extremely simple and unobtrusive
- persist citation/source data for newly generated replies
- keep source numbering deterministic across save, reload, and reopen
- keep the model focused on answer generation rather than UI formatting

## Non-Goals

- backfilling old existing messages
- storing full search history for every query attempt
- building a heavy preview modal or browser-like source viewer
- introducing multi-table citation analytics in v1

## Current Constraint

The current search implementation does not yet provide a real citation system.

Today:

- `required` mode injects numbered search results into the prompt
- the model may emit plain-text markers such as `[1]` or `[3]`
- the returned metadata is only a flat `sources[]` list with titles and URLs
- the frontend only uses that metadata for transient composer-level warnings
- citation/source metadata is not persisted with messages

As a result:

- inline markers are not clickable
- users cannot see which links those markers refer to
- source provenance disappears on reload

## Recommendation

Use a two-phase citation pipeline for searched replies.

1. The server decides whether a search is needed.
2. The server runs search and normalizes a compact source list.
3. The server generates the final answer against that normalized source list.
4. The model cites sources only with separate numeric markers such as `[1] [3]`.
5. The server persists the reply text and the normalized source metadata together.
6. The UI upgrades valid markers into clickable citation chips and renders a minimal source tray for that reply.

This keeps the model narrow, keeps source numbering stable, and makes persistence deterministic.

## Ownership Split

### Model

The model should own:

- answer text
- deciding which provided sources to reference
- emitting separate compact markers such as `[1] [3]`

The model should not own:

- raw URLs
- source-card formatting
- source tray structure
- link rendering
- source numbering outside the server-provided evidence list

### Server

The server should own:

- whether search runs
- search query generation in `auto` mode
- source normalization
- source numbering
- persistence of message-level source metadata
- repair or rejection of invalid citation markers before save

### UI

The UI should own:

- citation marker parsing
- chip rendering
- source tray open/close behavior
- the fallback `Sources N` affordance
- external-link launching

## Search Flow

### Required Mode

- run search before answer generation
- normalize the returned sources
- build the final answer prompt from the normalized source list
- persist the source metadata on the assistant message

### Auto Mode

In `auto` mode, do not rely on unconstrained tool-calling for the final answer.

Instead:

1. run a small planner step that returns only:
   - `shouldSearch`
   - `query`
2. if `shouldSearch` is false, answer normally with no search metadata
3. if `shouldSearch` is true, run search once and proceed through the same normalized citation pipeline used by `required` mode

This keeps source numbering stable and avoids mismatches between multiple tool calls and the final stored citation set.

## Persisted Message Contract

Add a nullable `search_metadata jsonb` field to `public.messages`.

Contract:

- `null` means no search ran for that reply
- a non-null object means the reply went through a search attempt, whether successful or not
- only `status === 'success'` should unlock source UI

Recommended v1 shape:

```ts
type PersistedSearchMetadata = {
  version: 1;
  mode: 'auto' | 'required';
  status:
    | 'success'
    | 'no_results'
    | 'missing_config'
    | 'timeout'
    | 'upstream_error';
  query: string | null;
  sources: Array<{
    id: number;
    title: string;
    url: string;
    domain: string;
    snippet: string;
  }>;
};
```

Notes:

- `id` is the stable display/reference id and matches inline citation numbers
- `domain` is server-derived for lightweight display
- `snippet` should be short and already sanitized
- v1 does not need a separate citations table

## Frontend Data Model

Extend the home message model to support optional per-message search metadata.

That means:

- the `messages` row loader must fetch `search_metadata`
- the frontend `Message` type must carry optional `searchMetadata`
- newly returned chat responses should include the same metadata so the fresh reply can render citations immediately

Old messages without this field should continue rendering exactly as they do today.

## UI Behavior

The source interaction should stay attached to the reply, not a global modal.

### Inline Citations

- valid numeric markers such as `[1]` become separate compact clickable chips
- separate markers stay separate: `[1] [3]`
- invalid markers remain plain text
- citation chips should feel like annotations, not action buttons

### Source Tray

- each assistant reply with `search_metadata.status === 'success'` can expose a minimal inline source tray
- the tray opens below that reply
- only one reply’s tray should be open at a time
- clicking a citation chip opens the tray and focuses that source
- clicking the active citation chip again closes the tray

Recommended tray content:

- source title
- source domain
- one short snippet
- `Open source`

The tray should not:

- open in a full-screen modal
- show a large embedded preview
- add heavy visual chrome

### Fallback Source Affordance

If a reply has stored sources, show a subtle footer affordance such as `Sources 3`.

This provides a source entry point even when:

- the reply has sources but no inline citations
- the user prefers browsing all sources from the reply footer

## Failure Handling

Failure should degrade quietly.

- if search fails or returns nothing useful, the reply still renders normally
- if `search_metadata.status !== 'success'`, do not show empty source chrome
- if the model emits a citation id that is not present in `sources[]`, leave that marker as plain text
- if the model forgets to cite any sources, the reply can still expose `Sources N` when sources exist

To keep persisted citations trustworthy, the server should validate the final answer text before save.

If invalid citation ids appear, the preferred order is:

1. strip invalid markers
2. if needed, run one lightweight repair pass
3. save only a reply whose citation markers match the persisted source ids

## Memory And Context Hygiene

Search/citation scaffolding should not pollute future prompts or memory extraction.

Recommended rule:

- persist the user-facing assistant reply text
- strip citation markers before reusing assistant text for memory extraction
- strip citation markers before reusing assistant text as prior conversational context for later model calls
- never persist raw Tavily output or extra search prompt scaffolding in chat history

This keeps future reasoning grounded in the conversation rather than in citation formatting noise.

## Implementation Shape

High-level slices only:

1. Add message persistence support for `search_metadata`.
2. Update the chat route to use the two-phase search pipeline.
3. Update the conversation loader and message type to include per-message search metadata.
4. Upgrade markdown rendering so valid `[n]` markers become citation chips.
5. Add a minimal inline source tray and fallback `Sources N` footer at the reply level.
6. Add validation, repair, and stripping helpers for citation text.
7. Add route, rendering, and browser coverage from the companion testing doc.

## Rollout Boundary

This feature applies only to newly generated replies after the schema and UI changes ship.

Old messages:

- remain unchanged
- do not need backfill
- continue rendering without citation/source UI

## Open Decisions Resolved In This Doc

- v1 should support both inline citations and a simple source tray
- the source tray should be minimal and non-obnoxious
- citations should persist
- persistence only needs to apply to new replies
- separate citations should render as separate compact chips, not merged markers

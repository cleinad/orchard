# Search Mode Design

Date: 2026-04-17

## Summary

Keen should replace its current Tavily-based live search path with an explicit-only `Search` mode built around a deterministic router and a multi-provider retrieval pipeline.

The target product behavior is:

- normal chat never performs web retrieval
- `Search` mode always performs retrieval
- retrieval strategy depends on the query, but the user sees only one simple `Search` control
- official, primary, and research-backed sources outrank random blogs, forums, and low-authority pages by default
- search mode remains conversational, with a typical latency target of `4-7s`

This design uses:

- `Brave` as the broad web backbone
- `Exa` as higher-quality content and research augmentation
- `X` as optional social augmentation for reaction or live-discourse queries

It does not introduce another LLM call for search planning or routing.

## Product Fit

This design follows the product direction in [outline.md](../../outline.md):

- Keen is a workspace for deep exploration, not a generic answer engine.
- Search is a supporting capability, not the whole product.
- Depth matters more than raw speed, but the product must remain chat-first.

Because of that, the right model is not hidden auto-search. The right model is one explicit `Search` mode that materially improves evidence quality when the user asks for it.

## Goals

- make `Search` mode noticeably better than model-only chat
- search across many candidate sources without overwhelming the final answer
- prioritize official and reputable sources by default
- support current-event, research-heavy, and social-discourse queries without a separate user-visible mode for each
- stay within a typical `4-7s` response target
- keep the current message-level citation and source persistence model

## Non-Goals

- building a long-running deep research workflow
- introducing a second LLM for routing
- exposing multiple user-visible search modes in v1
- persisting every retrieved candidate or full search session analytics
- adding a new search-specific database table in v1

## Current Problems

The current implementation is a good baseline but too narrow for the intended product quality.

Current behavior:

- one provider: Tavily
- one query
- one search pass
- small retrieved result set
- persisted sources capped to a very small visible set
- no provider specialization for scholarly, official, or social sources
- hidden `auto` planner behavior in non-search mode

This produces answers that can be grounded, but not in a way that feels meaningfully better than a standard search-enabled chat assistant.

## Product Behavior

### User-Facing Behavior

- normal chat does not perform live retrieval
- `Search` mode always performs retrieval
- the user sees one `Search` control, not multiple research modes
- the backend chooses the retrieval mix internally based on the query

### Search Profiles

The router assigns a primary profile:

- `fresh_web`
- `research_backed`
- `web_social`
- `official_priority`

These profiles are internal only. The user remains in one visible `Search` mode.

## Deterministic Routing

Routing is rule-based and scoring-based. It does not use a second model call.

### Router Inputs

- raw user query
- normalized tokens and phrases
- freshness cues such as `latest`, `today`, `recent`, `this week`, `new`, `changed`, `announced`, `released`
- source-intent cues such as `official`, `docs`, `documentation`, `studies`, `paper`, `research`, `evidence`, `on X`, `on Twitter`, `what are people saying`
- simple entity hints derivable from the query itself

### Routing Precedence

1. explicit social intent -> `web_social`
2. explicit research or evidence intent -> `research_backed`
3. explicit official, docs, or primary-source intent -> `official_priority`
4. freshness or current-events intent -> `fresh_web`
5. default in `Search` mode -> `fresh_web`

### Explicit Overrides

The router should support simple hard overrides:

- `use papers`, `research only`, `what does the evidence say` -> `research_backed`
- `search X`, `on X`, `what are people saying` -> `web_social`
- `official sources only`, `docs`, `release notes`, `filing` -> `official_priority`

## Provider Roles

Providers are not mutually exclusive. They play different roles.

### Brave

`Brave` is the broad web backbone for:

- current events
- company and product updates
- official pages
- docs and changelogs
- primary reporting and high-quality secondary reporting

Brave is the default retrieval provider in every profile except where a provider outage forces fallback behavior.

### Exa

`Exa` is the higher-quality augmentation provider for:

- research-heavy questions
- content-rich extraction
- stronger paper or institutional-source discovery
- queries where broad search alone is unlikely to surface the best evidence

Exa should not be called for every searched query in v1. It should be used when the router identifies a research-backed or official-priority query that would benefit from better source quality.

### X

`X` is an optional social augmentation provider for:

- live reactions
- public discourse
- outage chatter
- sentiment or opinion-oriented questions

`X` is not a substitute for factual web retrieval. If `X` is used, `Brave` should normally still be used as well.

## Retrieval Pipeline

### Flow

1. determine search profile
2. call relevant providers in parallel
3. normalize results into one internal candidate shape
4. deduplicate URLs and overlapping stories
5. rerank using deterministic scoring
6. build a synthesis evidence pool
7. build a smaller visible persisted source set
8. generate the final answer from the reranked evidence

### Candidate Retrieval Targets

The exact counts can be tuned, but v1 should be materially broader than the current implementation.

- `fresh_web`
  - `Brave`: `12-20` candidates
- `research_backed`
  - `Brave`: `10-15` candidates
  - `Exa`: `8-15` candidates
- `web_social`
  - `Brave`: `8-12` candidates
  - `X`: `8-15` posts
- `official_priority`
  - `Brave`: `10-15` candidates with stronger official bias
  - optional `Exa`: `5-10` candidates when the query is docs-heavy or evidence-heavy

### Internal Candidate Shape

All provider results should normalize to a shared internal shape:

```ts
type SearchCandidate = {
  title: string;
  url: string;
  domain: string;
  snippet: string;
  provider: 'brave' | 'exa' | 'x';
  sourceType:
    | 'official'
    | 'docs'
    | 'research'
    | 'news'
    | 'government'
    | 'social'
    | 'forum'
    | 'video'
    | 'other';
  publishedAt: string | null;
  authorityScoreHint: number;
  freshnessScoreHint: number;
};
```

### Deduplication

The pipeline should:

- canonicalize URLs
- collapse duplicates and near-duplicates
- reduce repeated syndicated stories
- prevent the final evidence set from becoming many copies of one story

### Reranking

Reranking should be deterministic and weighted. It should not use another model call.

Recommended ranking dimensions:

- query relevance
- source authority
- source-type preference for the active profile
- freshness
- content richness
- diversity
- user-generated-content penalty

## Source Quality Policy

### Default Source Trust Order

For factual claims, default ranking should prefer:

1. official docs, company pages, government pages, filings, primary announcements
2. peer-reviewed papers, journals, PubMed-like or institutional research pages
3. major reporting and high-quality analysis
4. specialist blogs and independent technical writeups
5. forums, Reddit, low-authority summaries, random blogs
6. social posts

This order can flex by profile, but should not collapse entirely.

### Global Ranking Rules

- official and primary sources outrank random blogs and low-authority summaries
- research-backed sources outrank forums for evidence-heavy questions
- `X` can contribute to reaction and discourse, but should not dominate factual claims
- user-generated sources are strongly demoted by default
- if the user explicitly asks for sentiment, opinion, anecdotes, or community reactions, the user-generated penalty is reduced

### YouTube Policy

- allow official channels, institutional recordings, lectures, and conference talks
- heavily demote generic commentary channels by default
- prefer canonical written sources over video summaries when both exist

### X Policy

- useful for “what are people saying right now” questions
- useful for live incidents and reaction-oriented queries
- not sufficient on its own for strong factual claims unless the account itself is an authoritative primary source

### Diversity Rules

The final evidence set should avoid:

- too many links from one domain
- repeated rewrites of the same story
- shallow result sets made entirely of one source type

Where possible, Keen should include a mix of:

- primary sources
- secondary reporting
- supporting context

## Evidence Set Size

The product should use soft targets rather than hard caps.

- retrieved candidates: typically `20-40+`
- synthesis pool: roughly `10-20`
- visible final sources: usually `6-12`, with flexibility above that when breadth genuinely improves the answer

The visible source set should not be padded. Every shown source should materially support the answer.

## Answer Generation Rules

- answer generation should use the reranked synthesis pool, not raw provider output
- the model should ground externally verifiable claims in the provided evidence only
- numeric citations should remain stable and deterministic
- if evidence is mixed, thin, or incomplete, the answer should say so briefly rather than overclaim
- multiple sources may support the same point when that improves trust and clarity

## Persistence Contract

The current `public.messages.search_metadata jsonb` column is sufficient for this phase. No table reset is needed.

The persisted payload should evolve from the current minimal shape to a versioned v2 shape.

```ts
type PersistedSearchMetadataV2 = {
  version: 2;
  mode: 'required';
  profile: 'fresh_web' | 'research_backed' | 'web_social' | 'official_priority';
  status:
    | 'success'
    | 'partial'
    | 'no_results'
    | 'missing_config'
    | 'timeout'
    | 'upstream_error';
  query: string | null;
  providers: Array<'brave' | 'exa' | 'x'>;
  sources: Array<{
    id: number;
    title: string;
    url: string;
    domain: string;
    snippet: string;
    provider: 'brave' | 'exa' | 'x';
    sourceType:
      | 'official'
      | 'docs'
      | 'research'
      | 'news'
      | 'government'
      | 'social'
      | 'forum'
      | 'video'
      | 'other';
    publishedAt: string | null;
  }>;
};
```

### Persistence Rules

- persist only the final visible evidence set, not every retrieved candidate
- preserve stable numeric ids for citations
- support `partial` when some providers fail but grounding still succeeds
- keep failure metadata for searched replies even when no useful sources survive

## UI Implications

The current UI can keep message-level citations, but the source presentation should evolve.

### Keep

- numeric inline citations
- per-reply source tray or reply-attached source surface
- persisted source metadata on each assistant message

### Change

- remove the current `Auto / Always on` mental model in favor of a simple explicit `Search` mode
- remove the assumption that only a few sources will be shown
- update the source tray so it remains usable with `10+` visible sources

For v1, the source UI should support a compact list or card-based selection model rather than only a row of numbered tabs.

## Codebase Shape

This should be implemented as an evolution of the current API route, not as a new system outside it.

Recommended modules:

- `frontend/lib/search/router.ts`
- `frontend/lib/search/providers/brave.ts`
- `frontend/lib/search/providers/exa.ts`
- `frontend/lib/search/providers/x.ts`
- `frontend/lib/search/normalize.ts`
- `frontend/lib/search/rerank.ts`
- `frontend/lib/search/pipeline.ts`

### Chat Route Changes

In [frontend/app/api/chat/route.ts](../../../frontend/app/api/chat/route.ts):

- remove the current planner-based auto-search path
- when `searchEnabled = false`, do not search
- when `searchEnabled = true`, always run the deterministic search pipeline
- continue to generate the final answer from server-owned grounded context

### Search Metadata Utilities

In the current search metadata utilities:

- remove the hard persisted source cap
- extend parsing and validation to support version 2 metadata
- preserve citation cleanup and invalid-citation stripping

## Failure Handling

- if `Brave` fails and `Exa` succeeds, still answer from `Exa`
- if `Exa` fails and `Brave` succeeds, still answer from `Brave`
- if `X` fails, never block the answer
- if only weak evidence is available, answer with a brief caveat
- if all providers fail, return a normal answer with explicit disclosure

Search mode should degrade in quality, not collapse entirely.

## Rollout

Recommended rollout order:

1. replace Tavily with the new explicit-only search pipeline
2. ship `Brave + Exa`
3. update persistence and citation utilities for v2 metadata
4. update the source UI for larger visible source sets
5. add `X`
6. tune routing and ranking weights from real usage

This order captures most of the quality gain without making the first release too broad.

## Testing

### Automated

- router classification tests
- normalization and source typing tests
- reranking tests
  - official source beats random blog
  - research source beats forum for evidence queries
  - `X` is demoted for factual claims
- `/api/chat` tests for explicit-only search behavior
- provider fallback and `partial` success tests
- persistence tests for v2 `search_metadata`
- UI tests for large visible source sets

### Manual

- confirm normal chat never performs retrieval
- confirm `Search` mode always performs retrieval
- confirm official sources are prioritized for factual or product-update queries
- confirm research-heavy queries surface stronger evidence than generic web search alone
- confirm social sources appear only when appropriate
- confirm source UI remains usable with `10+` visible sources

## Deferred Work

The following items are intentionally deferred:

- full search session analytics
- provider-agnostic cache layers beyond simple near-term query caching
- cross-message or cross-conversation evidence reuse
- a dedicated deep research mode
- separate source tables or citation analytics tables

## Recommendation

Adopt a single explicit `Search` mode backed by a deterministic internal router and a multi-provider pipeline.

For v1:

- use `Brave` as the default broad-search backbone
- use `Exa` as conditional augmentation for research-backed or official-priority queries
- add `X` only where reaction or discourse is genuinely relevant
- keep persistence on `messages.search_metadata`
- evolve metadata to a versioned v2 payload
- prioritize official and primary sources over random blogs and low-authority pages across all profiles

This is the smallest architecture that makes Keen’s search mode feel materially deeper, more trustworthy, and more aligned with the product’s “workspace for deep exploration” positioning.

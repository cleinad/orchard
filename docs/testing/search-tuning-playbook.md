# Search Tuning Playbook

This is the manual process for validating and tuning Keen's Search mode with real provider traffic.

## What To Call It

The general process is usually called one of:

- retrieval tuning
- search relevance tuning
- retrieval evaluation

For Keen, use `Search Tuning` as the short name. That keeps it understandable in product and engineering conversations while still being technically accurate.

## When To Use This

Run this playbook when:

- Search mode has shipped a new provider or reranking change
- result quality feels off in real usage
- latency feels worse than expected
- telemetry shows a provider is returning weak or noisy evidence
- you want to decide whether to change result counts, timeouts, routing rules, or rerank weights

## Current Scope

This playbook is for the current v1 stack:

- `Brave`
- `Exa`
- deterministic routing
- structured server-side search telemetry

It is intentionally manual right now. Keen does not yet have durable search analytics tables.

## Prerequisites

Before tuning:

1. Configure real keys in [README.md](../../README.md):
   - `BRAVE_API_KEY`
   - `EXA_API_KEY`
2. Start the frontend locally:

```bash
cd frontend
npm run dev
```

3. Use Search mode from the actual app UI.
4. Watch the server logs while sending searched messages.

## Tuning Goals

The goal is not "more sources." The goal is:

- correct route selection
- strong official and authoritative sources near the top
- useful diversity across the final visible set
- acceptable latency for the routed query type
- graceful partial results when one provider fails

## Query Matrix

Use at least one query from each bucket.

### Fresh Web

- `What changed with OpenAI pricing this week?`
- `Latest OpenAI API updates`

Expected:

- profile: `fresh_web`
- providers: usually `brave`
- official pages and major reporting above random blogs

### Official Priority

- `Official Anthropic release notes for Claude`
- `OpenAI pricing official sources only`

Expected:

- profile: `official_priority`
- providers: `brave + exa`
- docs, changelogs, pricing pages, and company pages above commentary

### Research Backed

- `What does the evidence say about creatine and cognition?`
- `Research on sleep deprivation and memory consolidation`

Expected:

- profile: `research_backed`
- providers: `brave + exa`
- papers, PubMed, university, or institutional sources above forums/blogs

### Weak Or Edge Case

- `Latest updates on a very obscure topic`
- a vague query with no clear official source

Expected:

- search may still succeed, but telemetry should show whether weak quality came from routing, sparse results, or provider failures

## What To Watch In Telemetry

Current search telemetry emits:

- `search.request_started`
- `search.route_selected`
- `search.provider_finished`
- `search.pipeline_completed`
- `search.pipeline_failed`

Read these in order.

### 1. Route Selection

Check:

- `profile`
- `providers`
- `providerRequestCount`
- `freshness`

Questions:

- Did the query go to the right profile?
- Did it use one provider or two?
- Did freshness get recognized correctly?

If wrong:

- adjust routing cues or precedence in `frontend/lib/search/router.ts`

### 2. Provider Quality

Check each `search.provider_finished` event:

- `provider`
- `status`
- `durationMs`
- `requestedResultCount`
- `usefulResultCount`
- `httpStatus`

Questions:

- Is one provider consistently slow?
- Is one provider returning many unusable results?
- Is a provider timing out too often?

If wrong:

- reduce provider result count
- adjust timeout budget
- narrow provider usage to the query classes where it actually helps

### 3. Pipeline Outcome

Check `search.pipeline_completed`:

- `dedupedCount`
- `rankedCount`
- `visibleCount`
- `failedProviderCount`
- `outboundRequestCount`
- `durationMs`

Questions:

- Did dedupe collapse too much?
- Are we surfacing too few visible sources?
- Are partial results still good enough?
- Is total search latency acceptable for this route?

If wrong:

- tune visible-count rules
- tune rerank weights
- revisit provider mix for that route

## How To Judge Quality

For each query, record:

- query
- expected profile
- actual profile
- expected providers
- actual providers
- top 3 visible sources
- whether the answer felt trustworthy
- whether latency felt acceptable
- what should change, if anything

Use a simple outcome label:

- `good`
- `acceptable`
- `needs tuning`

## Common Tuning Levers

Use the smallest lever that explains the problem.

### Wrong Route

Change:

- query cue lists
- route score thresholds
- route precedence

File:

- `frontend/lib/search/router.ts`

### Good Route, Bad Ranking

Change:

- authority boosts
- social/forum penalties
- domain diversity behavior
- official/research weighting

File:

- `frontend/lib/search/rerank.ts`

### Good Ranking, Poor Provider Yield

Change:

- provider result counts
- provider freshness filters
- provider category selection
- timeouts

Files:

- `frontend/lib/search/providers/brave.ts`
- `frontend/lib/search/providers/exa.ts`

### Good Results, Bad Latency

Change:

- lower requested result counts
- lower timeout budgets
- reduce two-provider usage where one provider is enough
- add caching later if repeated queries justify it

## Suggested Tuning Order

Use this order so you do not overfit the wrong part of the system:

1. Verify route correctness
2. Verify provider health and latency
3. Verify top-source quality
4. Tune reranking
5. Tune result counts and timeouts
6. Only then decide whether caching is needed

## Exit Criteria

Search tuning for a slice is "good enough" when:

- route selection looks correct for the test matrix
- official queries consistently show official sources high in the set
- research queries consistently show stronger institutional or paper sources high in the set
- weak or sparse queries fail gracefully
- latency is acceptable for the routed query class
- provider failures are visible in logs and do not silently degrade quality

## Related Docs

- [Search Mode](../features/live-search.md)
- [Search Citations Testing](./search-citations-and-source-ui.md)
- [Docs Index](../README.md)

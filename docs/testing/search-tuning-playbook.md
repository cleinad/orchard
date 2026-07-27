# Search Tuning Playbook

Use this manual process to evaluate live-search routing, provider quality,
ranking, latency, and failure behavior with real provider traffic.

## When to use it

- a provider, query planner, router, relevance gate, or reranker changes
- real searches return weak or noisy sources
- latency changes materially
- structured telemetry shows repeated partial failures

Automated tests should pass before tuning. This playbook evaluates behavior that
mocks cannot establish.

## Prerequisites

1. Configure `BRAVE_API_KEY` and `EXA_API_KEY` in `frontend/.env.local`.
2. Optionally configure the compatible search-planner endpoint described in
   [Local setup](../development/setup.md).
3. Start Orchard:

```bash
cd frontend
npm run dev
```

4. Use Auto or Always search in the actual chat UI.
5. Watch server logs for structured search events.

Do not copy prompts, provider keys, or sensitive result content into a permanent
evaluation note.

## Evaluation matrix

Use at least one query from each category.

### Fresh web

Examples:

- `What changed with OpenAI API pricing this week?`
- `Latest official Next.js release`

Expected:

- `fresh_web` profile
- current official sources and strong reporting near the top
- freshness settings appropriate to the query

### Official sources

Examples:

- `Official Anthropic release notes for Claude`
- `OpenAI pricing from official sources`

Expected:

- `official_priority` profile
- documentation, changelogs, pricing pages, and first-party sources above
  commentary

### Research evidence

Examples:

- `What does the evidence say about creatine and cognition?`
- `Research on sleep deprivation and memory consolidation`

Expected:

- `research_backed` profile
- papers, institutional sources, and appropriate review material above generic
  blogs or forums

### Social or reaction intent

Choose a query explicitly asking how people are reacting.

Expected:

- `web_social` profile
- web sources appropriate to public reaction
- no claim that unsupported social platforms were searched

### Sparse or ambiguous

Use an obscure topic and a vague follow-up.

Expected:

- weak evidence is filtered rather than padded into the visible set
- Always search discloses an unavailable or ungrounded result
- Auto can fall back silently to an unsourced answer

## Telemetry sequence

Read events in order:

1. `search.request_started`
2. `search.route_selected`
3. `search.provider_finished`
4. `search.pipeline_completed` or `search.pipeline_failed`

### Route

Inspect:

- profile
- selected providers
- planned request count
- freshness

If the route is wrong, adjust cues, thresholds, or precedence in
`frontend/lib/search/router.ts`. If a model-generated plan is wrong, inspect its
validated output and fallback behavior before changing deterministic routing.

### Providers

For each provider, inspect:

- status and duration
- requested and useful result counts
- HTTP status

Repeated low yield suggests a query, category, count, or provider-selection
problem. Repeated timeouts suggest a timeout or route-cost problem.

### Pipeline

Inspect:

- deduplicated count
- ranked count
- visible count
- failed-provider count
- outbound request count
- total duration

This distinguishes sparse retrieval from over-aggressive relevance filtering or
poor ranking.

## Recording results

For each query, record only:

- query or a safe paraphrase
- expected and actual profile
- expected and actual providers
- top visible domains
- `good`, `acceptable`, or `needs tuning`
- perceived latency
- smallest plausible change

Avoid building a permanent analytics system in Markdown. Keep a short working
note while tuning and move only genuine follow-up work into the
[backlog](../backlog.md).

## Tuning order

1. Fix route selection.
2. Fix provider errors and timeouts.
3. Check relevance acceptance and deduplication.
4. Tune authority, source type, and diversity ranking.
5. Tune result counts and timeouts.
6. Consider caching only after repeated-query evidence justifies it.

Relevant implementation:

- `frontend/lib/search/router.ts`
- `frontend/lib/search/query-planner.ts`
- `frontend/lib/search/relevance.ts`
- `frontend/lib/search/rerank.ts`
- `frontend/lib/search/pipeline.ts`
- `frontend/lib/search/providers/`

## Exit criteria

- the evaluation matrix routes as expected
- official and research queries surface appropriate authority
- weak queries fail gracefully
- partial provider failures remain understandable
- latency is acceptable for each route class
- no prompt-derived sensitive content appears in telemetry
- each proposed code change is supported by repeated evidence, not one query

## Related docs

- [Live search](../features/live-search.md)
- [Testing](./README.md)
- [Backlog](../backlog.md)

# Search Mode

## Overview

Search mode lets Keen decide whether to ground a reply in fresh external sources, or lets the user explicitly force or disable retrieval for a reply.

This doc is the source of truth for the shipped v1 search behavior and the near-term follow-up work.

Search has three composer modes:

- `Auto`: Keen decides whether live sources would materially improve the answer
- `Always search`: Keen runs the server-owned retrieval pipeline before generating the reply
- `Off`: Keen answers without live retrieval

The backend chooses the retrieval mix internally based on the query.

## Shipped V1 Scope

The current slice includes:

- a visible `Search` mode selector with `Auto`, `Always search`, and `Off`
- conversational auto-search orchestration with deterministic fallbacks
- `Brave` as the broad web backbone
- `Exa` as the higher-quality and research-oriented augmentation layer
- authority-first reranking that prefers official and institutional sources over random blogs
- persisted search metadata v2 on assistant messages
- a source tray that can handle larger source sets than the previous 3-source assumption
- structured server-side search telemetry for route, provider, and pipeline events

## User-Facing Behavior

- The composer exposes `Auto`, `Always search`, and `Off`.
- Search mode defaults to `Auto`.
- Auto-search failures are intentionally user-invisible; Keen answers normally and logs the failure internally.
- Always Search no-result or relevance-rejected runs are recorded in metadata and shown as a neutral searched status, but do not prepend warning text to the reply.
- Replies generated in search mode can include numeric citations such as `[1]` and `[1] [3]`.
- Clicking a citation chip or the reply footer `Sources N` opens the reply-attached source tray.
- Source metadata is persisted on assistant messages, so citations and sources survive reloads.

## Internal Search Profiles

The user does not see these, but the backend routes searched queries into one primary profile:

- `fresh_web`
- `research_backed`
- `official_priority`
- `web_social`

Current v1 implementation ships:

- `Brave` as the broad web backbone
- `Exa` as research and higher-quality augmentation

The approved `web_social` profile and `X` integration are deferred until the core `Brave + Exa` pipeline is stable.

## Current Execution Flow

```
User sends message
    |
    v
searchMode state ('auto' | 'required' | 'off') — frontend/app/home/[[...conversationId]]/page.tsx
    |
    v
POST /api/chat includes { searchMode, timezone? }
    |
    v
Chat route maps:
  searchMode = 'off'      -> no retrieval
  searchMode = 'auto'     -> decideSearchNecessity()
  searchMode = 'required' -> run retrieval
    |
    +--- sanitizeHistoryMessages() strips citation markers
    |    before prior assistant text is reused
    |
    +--- append per-reply request context
    |      (current local time from browser timezone + saved user name when available)
    |
    +--- Mode: 'auto' -------> decide whether online sources help
    |                          if yes, plan and run search
    |
    +--- Mode: 'required' ---> planSearchAction()
    |                           runSearchPipeline(query)
    |                           classifySearchQuery()
    |                           provider retrieval in parallel
    |                           dedupe
    |                           rerank
    |                           createPersistedSearchMetadataV2()
    |                           buildGroundedSearchSystemPrompt()
    |                           streamText()
    |
    +--- Mode: 'off' --------> streamText() without retrieval
    |
    v
stripInvalidCitationMarkers() removes bad ids before save
    |
    v
Assistant message persisted with content + search_metadata
    |
    v
Response includes search status envelope for the latest reply
    |
    v
Frontend updates the last-reply search state
    |
    v
MarkdownWithThreads renders citation chips
    |
    v
SearchSourcesTray renders the reply-attached source tray
```

## Key Files

| File | Role |
|------|------|
| `frontend/app/api/chat/route.ts` | search-mode resolution, grounded prompt construction, persistence, activity streaming, and disclosures |
| `frontend/lib/search/orchestrator.ts` | auto/required planning, prior-source reuse, relevance checks, repair attempts, and activity summaries |
| `frontend/lib/search/query-planner.ts` | search decision and query planning with deterministic fallbacks |
| `frontend/lib/search/router.ts` | deterministic query routing |
| `frontend/lib/search/providers/brave.ts` | Brave retrieval client |
| `frontend/lib/search/providers/exa.ts` | Exa retrieval client |
| `frontend/lib/search/rerank.ts` | deterministic authority and relevance ranking |
| `frontend/lib/search/pipeline.ts` | provider orchestration, dedupe, rerank, and final evidence set assembly |
| `frontend/lib/search/telemetry.ts` | structured search logging, query redaction, and trace helpers |
| `frontend/lib/search-citations.ts` | metadata parsing, source normalization, citation cleanup, and v1/v2 compatibility |
| `frontend/lib/chat-search.ts` | response-level search envelope, warnings, and disclosure strings |
| `frontend/app/home/components/ChatComposer.tsx` | search mode selector copy and aria labels |
| `frontend/app/home/components/MarkdownWithThreads.tsx` | clickable citation chip rendering |
| `frontend/app/home/components/SearchSourcesTray.tsx` | larger-source-set reply tray UI |
| `frontend/app/home/components/useHomeData.ts` | persisted message loading and preview cleanup |

## Routing Rules

The router is deterministic and does not use another LLM.

High-level precedence:

1. explicit social or reaction intent -> `web_social`
2. explicit research or evidence intent -> `research_backed`
3. explicit docs, filing, pricing, release-notes, or official-source intent -> `official_priority`
4. freshness or current-events intent -> `fresh_web`
5. fallback in search mode -> `fresh_web`

Examples:

- `latest climate summit updates` -> `fresh_web`
- `what does the evidence say about creatine and cognition` -> `research_backed`
- `official sources only for Anthropic release notes` -> `official_priority`

## Provider Strategy

### Brave

Brave is the default backbone for:

- broad web retrieval
- current events and recent updates
- official product pages, docs, changelogs, and company announcements

### Exa

Exa is used when better source quality is needed, especially for:

- evidence-heavy queries
- research-backed queries
- official-priority queries where a second high-quality source family helps

## Source Quality Rules

Keen globally prefers higher-authority sources for factual claims:

1. official docs, company pages, government pages, filings, primary announcements
2. peer-reviewed or institutional research sources
3. major reporting and high-quality analysis
4. specialist blogs and independent technical writeups
5. forums, Reddit, low-authority summaries, and random blogs
6. social posts

Important constraints:

- official sources outrank random blogs by default
- research-heavy queries boost papers and institutional sources
- user-generated sources are strongly demoted unless the query explicitly asks for sentiment or reactions
- dedupe and diversity rules prevent the final set from becoming many copies of the same story

## Persisted Metadata

Search replies persist `search_metadata` on `public.messages`.

Legacy v1 rows are still readable. New writes use v2:

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
    provider: 'brave' | 'exa' | 'x' | null;
    sourceType:
      | 'official'
      | 'docs'
      | 'research'
      | 'news'
      | 'government'
      | 'social'
      | 'forum'
      | 'video'
      | 'other'
      | null;
    publishedAt: string | null;
  }>;
};
```

Rules:

- `search_metadata = null` means search did not run for that reply
- `status = 'partial'` means some providers failed but grounding still succeeded
- relevance-rejected results are persisted as a no-result run with empty `sources`
- the citation UI activates whenever usable grounded sources are present
- source ids remain stable and numeric for citation rendering

## Source UI

- Citation chips stay inline in the assistant reply.
- The reply footer still exposes `Sources N`.
- The tray now scales beyond the original 3-source assumption by using a scrollable source list plus a detail panel.
- The source surface stays attached to the reply and does not become a modal browser.

## Failure Handling

- if one provider succeeds and another fails, Keen still answers with `partial` search metadata
- if Always Search returns no useful or relevance-accepted sources, Keen answers without source grounding and records the no-result status in metadata
- if Always Search hits provider/config/timeout failures, Keen answers with a disclosure
- if Auto Search hits an internal search failure, Keen answers normally without user-visible warning or activity and logs the failure internally
- search snippets remain untrusted source material and are only used as grounding context
- invalid citation ids are stripped before save

## Search Telemetry

Search mode now emits structured server logs for the main search stages:

- `search.request_started`
- `search.route_selected`
- `search.provider_finished`
- `search.pipeline_completed`
- `search.pipeline_failed`

The logs include:

- trace id and conversation id
- routed profile and provider list
- planned provider count and actual outbound request count
- per-provider duration, status, requested result count, HTTP status, and useful result count
- pipeline-level deduped, ranked, and visible source counts

Privacy rule:

- local development logs include a short `queryPreview`
- production logs only include a `queryHash`

## Safety And Context Hygiene

- Search results are server-owned and prompt-controlled, not tool-called by the model during answer generation.
- Only the reranked evidence set is passed into the grounded prompt.
- Citation markers are stripped before assistant text is reused for memory extraction, previews, TTS, or future context reuse.
- Older replies with no `search_metadata` remain unchanged and do not render empty source UI.

## Remaining Work

The current implementation is intentionally a first slice, not the final search system.

Still left to do:

- run live-provider validation with real `BRAVE_API_KEY` and `EXA_API_KEY` across current-events, official-source, and research-heavy queries
- tune latency, result counts, timeout budgets, and rerank weights from real usage instead of only mocked tests
- add caching and durable telemetry only if structured server logs stop being enough
- add `X` integration for explicit reaction or sentiment queries under the deferred `web_social` profile
- add dedicated storage only if message-level `search_metadata` stops being sufficient for analytics or product needs

For the current manual workflow, use [Search Tuning Playbook](../testing/search-tuning-playbook.md).

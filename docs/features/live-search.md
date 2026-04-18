# Search Mode

## Overview

Search mode lets Keen ground a reply in fresh external sources when the user explicitly turns search on.

This doc is the source of truth for the shipped v1 search behavior and the near-term follow-up work.

Search is now explicit-only:

- when search is off, Keen answers without live retrieval
- when search is on, Keen always runs the server-owned retrieval pipeline before generating the reply

The UI still exposes a single simple toggle, but the backend chooses the retrieval mix internally based on the query.

## Shipped V1 Scope

The current slice includes:

- one visible `Search` toggle with no hidden auto-search path
- deterministic routing with no second LLM call
- `Brave` as the broad web backbone
- `Exa` as the higher-quality and research-oriented augmentation layer
- authority-first reranking that prefers official and institutional sources over random blogs
- persisted search metadata v2 on assistant messages
- a source tray that can handle larger source sets than the previous 3-source assumption

## User-Facing Behavior

- The composer toggle is a simple `Search` on/off control.
- Search mode is off by default.
- Turning search on does not expose multiple visible search modes.
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
User toggles Search on
    |
    v
searchEnabled state (boolean) — frontend/app/home/[[...conversationId]]/page.tsx
    |
    v
POST /api/chat includes { searchEnabled, timezone? }
    |
    v
Chat route maps:
  searchEnabled = false -> mode 'off'
  searchEnabled = true  -> mode 'required'
    |
    +--- sanitizeHistoryMessages() strips citation markers
    |    before prior assistant text is reused
    |
    +--- append per-reply request context
    |      (current local time from browser timezone + saved user name when available)
    |
    +--- Mode: 'required' ---> runSearchPipeline(message)
    |                           classifySearchQuery()
    |                           provider retrieval in parallel
    |                           dedupe
    |                           rerank
    |                           createPersistedSearchMetadataV2()
    |                           buildGroundedSearchSystemPrompt()
    |                           generateText()
    |
    +--- Mode: 'off' --------> generateText() without retrieval
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
| `frontend/app/api/chat/route.ts` | explicit-only search execution, grounded prompt construction, persistence, and disclosures |
| `frontend/lib/search/router.ts` | deterministic query routing with no secondary model call |
| `frontend/lib/search/providers/brave.ts` | Brave retrieval client |
| `frontend/lib/search/providers/exa.ts` | Exa retrieval client |
| `frontend/lib/search/rerank.ts` | deterministic authority and relevance ranking |
| `frontend/lib/search/pipeline.ts` | provider orchestration, dedupe, rerank, and final evidence set assembly |
| `frontend/lib/search-citations.ts` | metadata parsing, source normalization, citation cleanup, and v1/v2 compatibility |
| `frontend/lib/chat-search.ts` | response-level search envelope, warnings, and disclosure strings |
| `frontend/app/home/components/ChatComposer.tsx` | explicit search-toggle copy and aria labels |
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
- the citation UI activates whenever usable grounded sources are present
- source ids remain stable and numeric for citation rendering

## Source UI

- Citation chips stay inline in the assistant reply.
- The reply footer still exposes `Sources N`.
- The tray now scales beyond the original 3-source assumption by using a scrollable source list plus a detail panel.
- The source surface stays attached to the reply and does not become a modal browser.

## Failure Handling

- if one provider succeeds and another fails, Keen still answers with `partial` search metadata
- if all providers fail or return no useful sources, Keen still answers with a disclosure
- search snippets remain untrusted source material and are only used as grounding context
- invalid citation ids are stripped before save

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
- add caching and provider-level observability so search mode performance and failures are easier to reason about in production
- add `X` integration for explicit reaction or sentiment queries under the deferred `web_social` profile
- add dedicated storage only if message-level `search_metadata` stops being sufficient for analytics or product needs

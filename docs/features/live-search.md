# Live Search

## Overview

Live search lets Keen ground new replies in current web results. Users control this with the toggle below the chat input.

## Modes

- **Auto** (default, toggle off): the server runs a short planning step against the latest user message plus a small recent conversation window. If the planner decides search is needed, the server runs one web search, normalizes the sources, and then generates the final answer from that evidence set. If the planner decides search is not needed, the final answer is generated without search.
- **Always on** (toggle on): the server always runs web search before generating the reply. If usable sources are returned, the final answer is generated from that normalized source set. If search fails or returns no useful results, Keen still answers and adds a brief disclosure.

Important behavior:

- Final answer generation no longer uses an in-model search tool. Search orchestration is server-owned.
- Successful searched replies can include numeric citations such as `[1]` and `[1] [3]`.
- Valid citation markers render as separate compact chips in the reply body.
- Clicking a citation chip or the footer `Sources N` control opens a minimal inline source tray under that reply.
- The source tray shows the stored source title, domain, snippet, and an `Open source` link.
- Assistant messages persist `search_metadata`, so citation chips and the source tray survive reloads for newly generated replies.
- Older messages with no `search_metadata` render exactly as before and do not show empty source UI.

## UI Feedback

- A pill-shaped toggle shows the current mode (`Auto` or `Always on`) with a search icon.
- Helper text explains the active mode on `sm+` screens.
- After each response, a status indicator shows:
  - success: `Last reply grounded with N live sources`
  - warning: `Live search did not find useful results for the last reply` or `Live search was unavailable for the last reply`
- Citation chips and the reply-level source tray only appear when the saved message `search_metadata.status === 'success'` and at least one source is present.
- The toggle is disabled while the model is loading.

## Implementation

### Data Flow

```
User clicks toggle
    |
    v
searchEnabled state (boolean) — frontend/app/home/[[...conversationId]]/page.tsx
    |
    v
POST /api/chat body includes { searchEnabled } — same file
    |
    v
Chat route converts: searchEnabled ? 'required' : 'auto'
    |
    +--- sanitizeHistoryMessages() strips citation markers from prior assistant messages
    |    before memory/context reuse
    |
    +--- Mode: 'required' --->  runWebSearch(message)
    |                           createPersistedSearchMetadata()
    |                           buildGroundedSearchSystemPrompt()
    |                           generateText()
    |
    +--- Mode: 'auto' -------> planSearch()
    |                           if shouldSearch:
    |                             runWebSearch(plannedQuery)
    |                             createPersistedSearchMetadata()
    |                             buildGroundedSearchSystemPrompt()
    |                             generateText()
    |                           else:
    |                             generateText() without search
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
Frontend updates lastSearchState — frontend/app/home/[[...conversationId]]/page.tsx
    |
    v
UI shows success/warning indicators — same file
    |
    v
Frontend loads persisted search_metadata for conversation/thread messages
    |
    v
MarkdownWithThreads renders compact citation chips
    |
    v
SearchSourcesTray renders the minimal inline source card
```

### Key Files

| File | Role |
|------|------|
| `frontend/app/home/[[...conversationId]]/page.tsx` | Search toggle, request body construction, `lastSearchState`, and last-reply search status UI |
| `frontend/app/api/chat/route.ts` | Converts `searchEnabled` to `searchMode`; planner step; search execution; grounded prompts; citation cleanup; persistence; disclosure handling |
| `frontend/lib/search-citations.ts` | Persisted search metadata shape, source normalization, citation parsing, citation stripping, and validation |
| `frontend/lib/chat-search.ts` | `SearchMetadata` types, response-level search status envelope, `addSearchInstructions()` for auto mode, warning strings, and disclosure injection |
| `frontend/lib/tools.ts` | `webSearch` tool definition (Vercel AI SDK `tool()`), `runWebSearch()`, Tavily integration, result sanitization |
| `frontend/app/home/components/MarkdownWithThreads.tsx` | Compact clickable citation chip rendering inside markdown |
| `frontend/app/home/components/SearchSourcesTray.tsx` | Minimal reply-level source tray UI |
| `frontend/app/home/components/useHomeData.ts` | Loads `search_metadata` on reload and strips citation markers from sidebar previews |
| `frontend/app/api/threads/[threadId]/messages/route.ts` | Includes `search_metadata` when thread messages are fetched |

### Persisted Search Metadata

Assistant messages store a compact JSON blob on `public.messages.search_metadata`:

```ts
type PersistedSearchMetadata = {
  version: 1;
  mode: 'auto' | 'required';
  status: 'success' | 'no_results' | 'missing_config' | 'timeout' | 'upstream_error';
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

Normalization rules:

- at most 3 persisted sources
- duplicate source URLs are dropped while preserving stable numeric ids
- `domain` is derived server-side from the source URL
- snippets are trimmed to a compact stored length
- `search_metadata = null` means no search attempt happened for that reply
- attempted searches can still persist failure metadata with an empty `sources[]`

### Search Execution

**Required mode** (`searchEnabled = true`):

1. `runWebSearch(message)` runs before answer generation when search is available.
2. The route normalizes the search output into persisted metadata.
3. Sources are injected into the final prompt inside `<web_search_results>` tags.
4. The model is instructed to cite only the provided source ids using separate markers like `[1] [3]`.
5. Invalid citation ids are stripped before the assistant message is saved.
6. If search is unavailable or unhelpful, the reply is still returned with a disclosure and no source tray UI.

**Auto mode** (`searchEnabled = false`):

1. `planSearch()` uses `generateObject()` with a very small schema to decide only `shouldSearch` and `query`.
2. If the planner returns `shouldSearch=false`, the route generates a normal reply and saves `search_metadata = null`.
3. If the planner returns a query, the route runs one search and follows the same grounded generation path as required mode.

### Safety And Constraints

- Search snippets are treated as untrusted source material and are only used as grounding context.
- The final answer prompt allows only numeric source ids from the normalized source list.
- Invalid citation ids are stripped before the assistant message is saved.
- Citation markers are stripped from assistant text before memory extraction, sidebar previews, TTS, and future model-context reuse.
- The citation/source UI only applies to newly generated replies with saved `search_metadata`; older replies are not backfilled.

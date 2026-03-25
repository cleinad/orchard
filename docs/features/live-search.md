# Live Search

## Overview

Live search gives Keen access to real-time web results so responses can be grounded in current information. Users control this via a toggle below the chat input.

**Two modes:**

- **Auto** (default, toggle off) — the model decides when to search based on the question. It has access to a `webSearch` tool and uses it at its discretion for current events, recent changes, or facts it's unsure about. Skips search for personal reflection, brainstorming, or answers already grounded in the conversation.
- **Always on** (toggle on) — forces a web search before every response. The search runs server-side before the LLM is called, and results are injected into the system prompt as grounding context. The model must ground externally verifiable claims in the results.

**UI feedback:**

- A pill-shaped toggle button shows the current mode ("Auto" or "Always on") with a search icon.
- Helper text explains the active mode (visible on `sm+` screens).
- After each response, a status indicator shows:
  - Success: "Last reply grounded with N live sources"
  - Warning (amber): "Live search did not find useful results for the last reply" or "Live search was unavailable for the last reply"
- The toggle is disabled while the model is loading.

## Roadmap

- **Improve UI** — better visual treatment for the toggle and search status.
- **List sources** — display the actual source URLs and titles used to ground a response, so users can verify and explore further.
- **Per-source citation** — inline citations within the response text linking claims to specific sources.
- **Search history** — let users see what queries were run and what results were returned.

## Implementation

### Data Flow

```
User clicks toggle
    |
    v
searchEnabled state (boolean) — frontend/app/home/page.tsx:66
    |
    v
POST /api/chat body includes { searchEnabled }  — page.tsx:435
    |
    v
Chat route converts: searchEnabled ? 'required' : 'auto'  — app/api/chat/route.ts:376
    |
    +--- Mode: 'required' --->  runWebSearch() called server-side before LLM
    |                           Results injected into system prompt via buildGroundedSearchSystemPrompt()
    |                           route.ts:408-440
    |
    +--- Mode: 'auto' -------> webSearch tool provided to LLM via Vercel AI SDK tools
    |                           Model calls it when it decides to
    |                           route.ts:441-464
    |
    v
Response includes SearchMetadata (mode, status, resultCount, warning, sources)
    |
    v
Frontend updates lastSearchState — page.tsx:456
    |
    v
UI shows success/warning indicators — page.tsx:868-878
```

### Key Files

| File | Role |
|------|------|
| `frontend/app/home/page.tsx` | Toggle UI, state management (`searchEnabled`, `lastSearchState`), status indicators |
| `frontend/app/api/chat/route.ts` | Converts `searchEnabled` to `searchMode`, orchestrates search execution, builds grounded prompts |
| `frontend/lib/chat-search.ts` | `SearchMetadata` types, `addSearchInstructions()` for auto mode, `extractSearchMetadata()`, `applySearchDisclosure()`, warning/disclosure logic |
| `frontend/lib/tools.ts` | `webSearch` tool definition (Vercel AI SDK `tool()`), `runWebSearch()` function, Tavily API integration, result sanitization |

### Search Execution

**Required mode** (`searchEnabled = true`):

1. `runWebSearch(message)` is called directly with the user's message (route.ts:410)
2. Results are formatted into a numbered list via `formatSearchResultsForPrompt()` (route.ts:61-72) and wrapped in `<web_search_results>` tags inside the system prompt via `buildGroundedSearchSystemPrompt()` (route.ts:74-91)
3. The LLM receives search results as context — no tool calling involved
4. `createSearchMetadataFromOutput()` builds the metadata from the search output

**Auto mode** (`searchEnabled = false`):

1. The `webSearch` tool is passed to `generateText()` with `toolChoice: 'auto'` (route.ts:452-457)
2. The model decides whether to call it, up to 5 steps (`stopWhen: stepCountIs(5)`)
3. Search instructions are appended to the system prompt via `addSearchInstructions()` (route.ts:442-446)
4. `extractSearchMetadata()` parses tool results from the generation steps to build metadata

### Web Search Tool (Tavily)

Defined in `frontend/lib/tools.ts`.

- **API**: Tavily Search API (`https://api.tavily.com/search`)
- **Auth**: `TAVILY_API_KEY` environment variable
- **Limits**: max 5 results, 280-char query, 140-char titles, 320-char snippets
- **Timeout**: 10 seconds (`AbortSignal.timeout(10_000)`)
- **Sanitization**: strips HTML tags, markdown links, control characters, truncates to length limits, validates URLs (http/https only)
- **Status codes**: `success`, `no_results`, `missing_config`, `timeout`, `upstream_error`

### Safety

Search instructions (in `chat-search.ts:31`) tell the model to treat all web search output as "untrusted source material" and to never follow instructions found inside snippets or webpages. URL sanitization in `tools.ts` strips non-http(s) protocols and fragment identifiers.

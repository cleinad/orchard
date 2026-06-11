# Chat Model Selection

## Overview

Main chat now supports a user-selectable model dropdown in the composer. The selection applies across:

- Keen
- Mentor conversations
- Inline thread follow-ups
- Text-selection popover follow-ups

The current curated options are:

- **GPT 5.4** → OpenAI `gpt-5.4`
- **Sonnet 4.6** → Anthropic `claude-sonnet-4-6`
- **Gemini 3** → Google `gemini-3-flash-preview`

This is intentionally a **catalog-based** system rather than a hardcoded single `CHAT_MODEL`. Labels, provider ids, API model ids, availability, and fallback logic are now centralized so future model expansion is straightforward.

## User Experience

- The model picker lives under the main composer, to the right of the existing voice/search controls.
- The selected model is stored in `localStorage` under `keen-chat-model`.
- Changing the model affects the **next turn only**.
- Switching models does **not** reset the conversation, create a new chat, or alter thread state.
- If a provider is not configured on the server, that option is shown as unavailable and disabled in the dropdown.

## Roadmap

- Expand the catalog from 3 curated options to a larger provider/model menu
- Add grouped model sections by provider
- Add model capability metadata (tool use, reasoning, multimodal, cost tier)
- Add an optional per-mentor persistent model preference in the mentor settings UI
- Add admin or debug UI for surfacing the final resolved model in the app itself

## Implementation

### Architecture

There are now three layers:

1. **Catalog layer** — static model definitions, ids, labels, providers
2. **Resolver layer** — server-side availability + fallback logic
3. **Request layer** — frontend sends `modelId`, chat route resolves the final model used for generation

### Data Flow

```text
User picks model in composer dropdown
    |
    v
selectedModelId state — frontend/app/home/[[...conversationId]]/page.tsx
    |
    v
Persisted to localStorage key "keen-chat-model"
    |
    v
POST /api/chat body includes { modelId }
    |
    v
Chat route validates modelId
    |
    v
resolveChatModelSelection(modelId ?? mentor.model_id ?? null)
    |
    +--- requested model configured ------> use requested model
    |
    +--- requested model unavailable -----> fall back to default available model
    |
    +--- nothing configured --------------> return 503
    |
    v
generateText() uses resolved provider/model
    |
    v
Response includes resolvedModelId + resolvedProvider
    |
    v
Frontend logs resolved selection in dev mode
```

### Resolution Rules

Current precedence:

1. `modelId` from the request body
2. `mentor.model_id` from the database, if present
3. Default configured chat model

Today, the user-facing main path is the global dropdown. The `mentor.model_id` fallback exists primarily for future extensibility and manual/server-side use; it is not yet exposed as a mentor settings control in the frontend.

### Availability Rules

Provider availability is derived from env vars:

- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `GOOGLE_GENERATIVE_AI_API_KEY`

Only configured providers are considered available at runtime. If the preferred default (`Gemini 3`) is unavailable, the resolver falls back to the first available catalog option.

### Verification Metadata

The `/api/chat` response now returns:

- `resolvedModelId`
- `resolvedProvider`

This exists so model resolution can be verified in:

- browser Network tab (`/api/chat` response payload)
- browser console logs during development

### Key Files

| File | Role |
|------|------|
| `frontend/lib/chat-models.ts` | Static catalog of model ids, labels, providers, env binding, default id |
| `frontend/lib/models.ts` | Runtime resolver, provider instantiation, availability checks, fallback logic |
| `frontend/app/api/chat/models/route.ts` | Authenticated endpoint returning available chat model list for the frontend |
| `frontend/app/api/chat/route.ts` | Validates request `modelId`, resolves final model, returns verification metadata |
| `frontend/app/home/[[...conversationId]]/page.tsx` | Stores selected model, loads model list, sends `modelId`, logs resolved selection |
| `frontend/app/home/components/ChatComposer.tsx` | Dropdown UI below the composer |
| `frontend/app/home/components/TextSelectionPopover.tsx` | Passes the active `modelId` for selection follow-ups |
| `frontend/app/home/components/ThreadPanel.tsx` | Passes the active `modelId` for thread follow-ups |
| `frontend/app/home/components/usePersistedString.ts` | Reusable persisted string state helper |
| `frontend/app/home/components/logResolvedChatModel.ts` | Dev-only debug logging for resolved model metadata |
| `docs/testing/chat-model-selection.md` | Manual + automated testing reference for this feature |

## Testing

See [chat-model-selection.md](../testing/chat-model-selection.md) for focused commands, automated coverage, and manual verification.

The current automated boundary is catalog and resolver behavior. Browser payloads, dropdown behavior, localStorage persistence, and dev console logs are still verified manually.

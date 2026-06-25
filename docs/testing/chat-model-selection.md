# Chat Model Selection Test Suite

For the overall test inventory, runner commands, and canary map, start with [README.md](./README.md).

## Running Tests

```bash
# From frontend/
npm test
npm run test:watch

# Focused model-selection tests
npx vitest run __tests__/lib/chat-models.test.ts __tests__/lib/models.test.ts
npx vitest run __tests__/app/chat-route.test.ts __tests__/app/chat-route-search.test.ts
```

**Framework:** Vitest — config at `frontend/vitest.config.ts`.

## Test Files

### `__tests__/lib/chat-models.test.ts`

Unit tests for the static model catalog in `frontend/lib/chat-models.ts`.

**Verifies:**
- Expanded curated options are present, including `Auto`, GPT, Claude, Gemini, DeepSeek, Qwen, and Kimi rows
- Public chat model ids are validated correctly
- Public effort levels are validated correctly
- Provider-specific effort capabilities are cataloged correctly
- Unknown model ids are rejected

### `__tests__/lib/models.test.ts`

Resolver tests for `frontend/lib/models.ts` with provider factories mocked.

**Verifies:**
- Provider availability is derived from env vars
- `Auto` resolves through the Chinese-provider-first fallback order
- Requested configured model resolves correctly
- Unavailable requested model falls back to the default available model
- Provider instantiation matches the resolved selection
- Provider-specific effort and thinking options are mapped correctly
- No configured providers returns the expected error

### `__tests__/app/chat-route.test.ts`

Route tests for `/api/chat`.

**Verifies:**
- Invalid model effort values are rejected
- Valid model effort and thinking settings reach answer generation as provider options
- Existing chat, memory, title, and retry behavior still works

## Manual Verification

### Main Composer

1. Open `/home`.
2. Switch the dropdown under the composer to each configured model.
3. For effort-capable models, open the Effort submenu and change the level.
4. Toggle Thinking for providers that expose the switch.
5. Send a message after each switch.
4. In the browser console, verify a debug line like:

```text
[chat:composer] { resolvedModelId: "...", resolvedProvider: "..." }
```

5. In the Network tab, inspect the `/api/chat` response JSON and confirm:
- `resolvedModelId` matches the selected or fallback model
- `resolvedProvider` matches the provider actually used

### Thread Panel

1. Open an inline thread.
2. Send a follow-up message.
3. Confirm the browser console shows:

```text
[chat:thread] { resolvedModelId: "...", resolvedProvider: "..." }
```

4. Confirm the `/api/chat` response includes the same metadata.

### Text Selection Popover

1. Highlight text in a conversation and ask a follow-up question.
2. Confirm the browser console shows:

```text
[chat:selection] { resolvedModelId: "...", resolvedProvider: "..." }
```

3. Confirm the `/api/chat` response includes the same metadata.

### Persistence

1. Select a non-default model.
2. Refresh the page.
3. Confirm the dropdown restores from `localStorage` key `keen-chat-model`.
4. Confirm effort restores from `keen-chat-model-effort`.
5. Confirm thinking restores from `keen-chat-thinking-enabled`.

### Fallback Behavior

1. Remove or unset one provider API key locally.
2. Reload the app.
3. Confirm the unavailable option is disabled in the dropdown.
4. If that model was previously selected, confirm the next request falls back to an available model and returns the fallback `resolvedModelId` / `resolvedProvider`.

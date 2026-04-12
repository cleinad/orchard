# Memory System Test Suite

For the overall test inventory, runner commands, and canary map, start with [../testing/README.md](../testing/README.md).

## Why These Tests Exist

The memory system is easy to break in ways that are not obvious from normal chat behavior. A user can still receive a good response even when:

- memory is no longer loaded into the prompt
- memory extraction silently stops running in the background
- mentor and global scopes are mixed incorrectly
- semantic retrieval falls back incorrectly or not at all
- edit/delete routes stop updating embeddings correctly

The goal of this suite is not just "does memory code run", but "does the product still honor the memory contract after refactors".

### The Contract We Care About

The tests are designed to protect four product-level guarantees:

1. **Chat loads memory in the right situations**  
   Persistent chats should load memory. Temporary chats should only load memory when explicitly configured to use existing memory.

2. **Chat writes memory in the right situations**  
   Persistent chats should schedule background extraction. Temporary chats should not persist memory.

3. **Memory retrieval degrades gracefully**  
   If semantic retrieval changes, RPC retrieval fails, embeddings are unavailable, or ranking logic shifts, the system should still produce a valid prompt context instead of failing hard.

4. **Users can safely inspect and manage memory items**  
   The memory item routes must keep scope, auth, normalization, and embedding side effects correct.

### What This Suite Is Optimized For

This suite is a **memory canary suite**. Engineers should be able to modify the memory system, run a focused set of tests, and quickly answer:

- Did I break prompt memory loading?
- Did I break background memory writes?
- Did I break scoping or ranking?
- Did I break edit/delete behavior?

This means the tests intentionally favor:

- contract checks at the route boundary
- integration tests around merge/retrieval behavior
- a small number of pure utility tests

This suite does **not** try to fully validate external providers. It can prove graceful fallback and call wiring, but it cannot prove that production provider keys are valid. Real API credentials still require a manual smoke test.

## Running Tests

```bash
# From frontend/
npm test                # Run all tests once
npm run test:watch      # Run in watch mode (re-runs on file changes)

# Run a specific test file
npx vitest run __tests__/app/chat-route.test.ts
npx vitest run __tests__/app/memory-items-routes.test.ts
npx vitest run __tests__/lib/memory-items.test.ts
npx vitest run __tests__/lib/memory-integration.test.ts
```

### Recommended Memory Canary Command

When changing the memory system, prefer running the focused canary suite instead of the entire frontend test suite:

```bash
npm test -- __tests__/app/chat-route.test.ts __tests__/app/memory-items-routes.test.ts __tests__/lib/memory-items.test.ts __tests__/lib/memory-integration.test.ts
```

**Framework:** Vitest — config at `frontend/vitest.config.ts`.

## Test Files

### `__tests__/app/chat-route.test.ts` (5 tests)

Route-level contract tests for `app/api/chat/route.ts`.

These exist because the highest-risk regressions often happen at the handoff boundary between chat orchestration and memory internals. The route decides:

- whether memory should be loaded
- whether background extraction should run
- which actor/scope should be used
- which Supabase client is handed to the background memory job

The service-role-key regression was exactly this kind of failure. The route test that asserts the authenticated Supabase client is passed into `processMemoryV2()` is intended to permanently lock down that behavior.

### `__tests__/app/memory-items-routes.test.ts` (6 tests)

Route-level tests for the memory item CRUD APIs.

These protect the user-managed memory surface:

- `GET /api/memory/items` applies auth and scope/status filters correctly
- `PATCH /api/memory/items/:id` normalizes updates and triggers the correct embedding side effect
- `DELETE /api/memory/items/:id` soft-deletes rows and removes embeddings

These tests matter because route regressions here often do not break chat immediately, but they do break memory hygiene and user trust.

### `__tests__/lib/memory-items.test.ts` (36 tests)

Unit tests for pure utility functions in `lib/memory-items.ts`. No mocking — all functions are pure input/output.

**Functions covered:**
- `normalizeMemoryText` — NFKC normalization, lowercase, punctuation/quote stripping, whitespace collapse
- `clampSalience` — bounds 0–100, rounding, NaN/Infinity fallback to 50
- `clampConfidence` — bounds 0–1, 3-decimal precision, NaN fallback to 0.7
- `estimateTokenCount` — word-based token estimation
- `jaccardSimilarity` — set intersection/union with stop word removal, empty input edge cases
- `lexicalOverlapScore` — query token coverage in target text
- `parseMemoryScope` / `parseMentorScope` — scope string parsing and validation

### `__tests__/lib/memory-integration.test.ts` (19 tests)

Integration tests for the write path (`processMemoryV2`) and read path (`loadMemoryContextV2`) with mocked externals.

**Mocking:** Supabase client (chainable mock with mutation tracking), `generateObject` (LLM call), and `embed`/`embedMany` (OpenAI embeddings). The reusable Supabase mock lives in `__tests__/helpers/mock-supabase.ts`.

#### Write path — `processMemoryV2` (12 tests)

| Test | Verifies |
|------|----------|
| Novel fact → insert | Single candidate creates a DB row with correct fields and triggers embedding upsert |
| Multiple novel facts | 3 distinct candidates produce 3 separate inserts |
| Exact duplicate → merge | Matching `normalized_text` + type triggers update (not insert), salience/confidence take max |
| Near-duplicate → merge | Texts differing only by stop words (jaccard ≥ 0.86) merge via update |
| Same text, different type | Identical text under a different `type` inserts instead of merging |
| Supersede + insert | `action: "update"` with moderate similarity (≥ 0.45) supersedes old row and inserts new |
| Low-similarity update | `action: "update"` with low similarity inserts without superseding |
| action=ignore skipped | No DB mutations for ignored candidates |
| Too-short text rejected | Text < 6 chars after sanitization produces no DB mutations |
| Mixed batch | 5 candidates (2 novel, 1 duplicate, 1 ignored, 1 too-short) → verifies exact insert/update counts |
| Embedding failure fallback | Memory row inserts still succeed even if embedding generation fails |
| Mentor-scoped write | `mentorId` context produces rows with `owner_type: "mentor"` and correct `owner_id` |

#### Read path — `loadMemoryContextV2` (7 tests)

| Test | Verifies |
|------|----------|
| Empty DB | Returns empty string |
| Core profile selection | Stable high-salience items appear under `## Core Profile`, profile/goal/preference types ranked higher |
| Token budget trimming | Episodic items dropped first, core items preserved (min 3 for default actor) |
| Mentor scoping | Mentor actor sees `## Global Profile` header, only mentor-owned items in relevant recall, other mentors excluded |
| RPC semantic ranking | Relevant recall prefers RPC semantic winners when available |
| Row embedding fallback (empty RPC) | Falls back to `memory_item_embeddings` rows when RPC returns no matches |
| Row embedding fallback (RPC error) | Falls back to row embeddings when RPC retrieval errors |

## Coverage Philosophy

Future engineers should preserve this split:

- **Route tests** protect behavioral contracts between the API layer and memory internals.
- **Integration tests** protect ranking, merge, fallback, and embedding side effects.
- **Utility tests** protect deterministic text normalization and scoring helpers.

If a change only updates internals but breaks one of these contracts, the suite should fail.

## Remaining Gaps

The suite is now strong enough to act as a real canary, but a few useful cases are still missing:

1. Read path behavior when `OPENAI_API_KEY` is absent.
2. Read path behavior when query embedding generation fails.
3. Write path behavior when loading existing scope items fails before merge logic runs.
4. Route-level 404 behavior for PATCH/DELETE when the target memory item is missing.
5. Route-level 500 behavior when Supabase returns unexpected errors.

## Current Shape Of The Suite

The memory canary suite is now:

- `__tests__/app/chat-route.test.ts`
- `__tests__/app/memory-items-routes.test.ts`
- `__tests__/lib/memory-integration.test.ts`
- `__tests__/lib/memory-items.test.ts`

That suite should answer, with high confidence, whether the memory product still works after changes to:

- prompt assembly
- chat modes
- mentor scoping
- merge logic
- retrieval logic
- embedding side effects
- memory item CRUD routes

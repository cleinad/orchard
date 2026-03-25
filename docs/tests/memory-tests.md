# Memory System Test Suite

## Running Tests

```bash
# From frontend/
npm test                # Run all tests once
npm run test:watch      # Run in watch mode (re-runs on file changes)

# Run a specific test file
npx vitest run __tests__/lib/memory-items.test.ts
npx vitest run __tests__/lib/memory-integration.test.ts
```

**Framework:** Vitest — config at `frontend/vitest.config.ts`.

## Test Files

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

### `__tests__/lib/memory-integration.test.ts` (13 tests)

Integration tests for the write path (`processMemoryV2`) and read path (`loadMemoryContextV2`) with mocked externals.

**Mocking:** Supabase client (chainable mock with mutation tracking), `generateObject` (LLM call), and `embed`/`embedMany` (OpenAI embeddings). The reusable Supabase mock lives in `__tests__/helpers/mock-supabase.ts`.

#### Write path — `processMemoryV2` (8 tests)

| Test | Verifies |
|------|----------|
| Novel fact → insert | Single candidate creates a DB row with correct fields and triggers embedding upsert |
| Multiple novel facts | 3 distinct candidates produce 3 separate inserts |
| Exact duplicate → merge | Matching `normalized_text` + type triggers update (not insert), salience/confidence take max |
| Near-duplicate → merge | Texts differing only by stop words (jaccard ≥ 0.86) merge via update |
| Supersede + insert | `action: "update"` with moderate similarity (≥ 0.45) supersedes old row and inserts new |
| action=ignore skipped | No DB mutations for ignored candidates |
| Too-short text rejected | Text < 6 chars after sanitization produces no DB mutations |
| Mixed batch | 5 candidates (2 novel, 1 duplicate, 1 ignored, 1 too-short) → verifies exact insert/update counts |
| Mentor-scoped write | `mentorId` context produces rows with `owner_type: "mentor"` and correct `owner_id` |

#### Read path — `loadMemoryContextV2` (5 tests)

| Test | Verifies |
|------|----------|
| Empty DB | Returns empty string |
| Core profile selection | Stable high-salience items appear under `## Core Profile`, profile/goal/preference types ranked higher |
| Token budget trimming | Episodic items dropped first, core items preserved (min 3 for default actor) |
| Mentor scoping | Mentor actor sees `## Global Profile` header, only mentor-owned items in relevant recall, other mentors excluded |

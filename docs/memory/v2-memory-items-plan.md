# Memory V2 Plan (Atomic `memory_items`)

## Purpose

Define a full replacement for the current `memory_files` system with atomic memory rows, while keeping chat quality high and latency stable.

This plan assumes:
- The app is still pre-production.
- We can do breaking internal changes.
- Novus should be able to use memory from all mentor conversations.

---

## Decision Summary

1. Replace markdown-file memory (`memory_files`) as source-of-truth with `memory_items` (one memory per row).
2. Keep the background memory agent pattern (`after()` + Haiku) unchanged.
3. Novus can retrieve across all user memory items (global + mentor-sourced).
4. Mentors retrieve mentor-local memory plus a small global profile context.
5. Enforce strict retrieval budgets to avoid prompt bloat.

---

## Why Replace `memory_files`

Current markdown blobs are easy for humans, but weak for system-level operations:
- No stable ID per memory fact.
- Hard to dedupe or supersede outdated facts.
- Hard to filter by mentor/source/type/confidence.
- Hard to scale retrieval without injecting too much text.

Atomic rows solve all of the above and make scoped retrieval deterministic.

---

## Target Data Model

### `memory_items` (new source of truth)

```sql
create table public.memory_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  -- ownership/scope
  owner_type text not null check (owner_type in ('global', 'mentor')),
  owner_id uuid references public.mentors(id) on delete cascade, -- required when owner_type='mentor' (or `experts` if final naming uses experts)

  -- content
  type text not null,      -- profile, preference, project, person, commitment, event, etc.
  text text not null,      -- atomic statement
  normalized_text text not null, -- canonicalized for dedupe

  -- quality + lifecycle
  confidence real not null default 0.7, -- model confidence
  salience int not null default 50,     -- 0-100 importance
  stability text not null check (stability in ('stable', 'episodic')),
  sensitivity text not null check (sensitivity in ('normal', 'private', 'sensitive')),
  status text not null default 'active' check (status in ('active', 'superseded', 'deleted')),

  -- provenance
  source_conversation_id uuid references public.conversations(id) on delete set null,
  source_message_id uuid references public.messages(id) on delete set null,
  source_role text check (source_role in ('user', 'assistant')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Indexes:
- `(user_id, status, updated_at desc)`
- `(user_id, owner_type, owner_id, status)`
- `(user_id, type, status)`
- `(user_id, stability, status)`
- optional trigram index on `normalized_text` for fast dedupe candidate search

RLS:
- standard `auth.uid() = user_id` for select/insert/update/delete.

### `memory_item_embeddings` (for semantic recall)

```sql
create table public.memory_item_embeddings (
  memory_item_id uuid primary key references public.memory_items(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  embedding vector(1536) not null,
  created_at timestamptz not null default now()
);
```

Indexes:
- vector index on `embedding`.
- `(user_id, memory_item_id)` btree.

---

## Access Policy

### Novus
- Read: all active memory items for user (global + all mentor-owned), ranked and budgeted.
- Write: global items by default.

### Mentors
- Read: mentor-owned active items + compact global profile card.
- Write: mentor-owned items.

This gives Novus full user context while keeping mentor behavior focused.

---

## Runtime Read Path (Prompt Assembly)

Build memory context in three blocks with a hard token cap:

1. `Core Profile` (always included, small)
- name, stable preferences, recurring constraints, long-term goals.

2. `Relevant Recall` (semantic + lexical retrieval)
- top-K by weighted score:
  - semantic relevance
  - salience
  - recency decay
  - confidence

3. `Recent Episodic`
- short window of recent high-salience events/commitments.

Hard limits:
- memory token budget: start at 800-1200 tokens.
- max items in prompt: start at 20-35.
- truncate oldest/lowest score first.

---

## Runtime Write Path (Haiku Agent)

The async pattern remains unchanged:
- Chat returns immediately.
- `after()` triggers memory extraction.

What changes:
- Haiku outputs strict JSON candidate items (not file edits).
- Server-side deterministic merge/upsert handles dedupe and superseding.

### Proposed `processMemoryV2` flow

1. Input:
- last ~8 messages + latest assistant response
- conversation metadata (`conversation_id`, `mentor_id` nullable)
- current date

2. Haiku output schema:
- `candidates[]` with:
  - `type`
  - `text`
  - `stability`
  - `sensitivity`
  - `salience`
  - `confidence`
  - `action` (`insert` | `update` | `ignore`)

3. Merge logic (deterministic app code):
- canonicalize text (`normalized_text`)
- find near-duplicates (same type + fuzzy/semantic similarity)
- if duplicate:
  - update existing item (`updated_at`, maybe `text/confidence/salience`)
  - mark old contradictory item `superseded` when needed
- if new:
  - insert as active item with provenance metadata

4. Embeddings:
- create/update vector row for active items.

5. Observability:
- log counts: extracted, inserted, merged, superseded, ignored.

---

## API and UI Changes

### Replace `memory_files`-centric editing API

Current:
- `PATCH /api/memory` and `DELETE /api/memory` by `fileId + entryIndex`

New:
- `GET /api/memory/items?scope=all|global|mentor:<id>`
- `PATCH /api/memory/items/:id` (edit text/metadata/status)
- `DELETE /api/memory/items/:id` (soft delete -> status=`deleted`)

### UI

Memory panel becomes item-based:
- filter chips: `All`, `Global`, `Mentor`, `Type`, `Stable/Episodic`
- sort options: `Recent`, `Important`
- item actions: `Edit`, `Delete`, `Pin` (later), `Never Use` (later)

Optional:
- keep a generated markdown “notebook” view for human readability.

---

## Migration Plan (Phased)

### Phase 0: Foundation

1. Add new tables, indexes, RLS, triggers.
2. Add typed models (`memory-items.ts`), validators, and server helpers.
3. Add structured logging for memory pipeline.

Exit criteria:
- schema deployed locally.
- basic CRUD test pass for authenticated user.

### Phase 1: Write Path V2 (Dual Write Optional)

1. Build `processMemoryV2` using Haiku JSON extraction.
2. Keep old `processMemory` disabled behind feature flag for rollback, or dual-write briefly for comparison.
3. Store provenance from `conversation_id` + latest user message.

Exit criteria:
- background writes produce clean `memory_items`.
- duplicate rate and invalid output rate acceptable.

### Phase 2: Read Path V2 for Novus

1. Implement `loadMemoryContextV2(userId, { actor: 'novus' })`.
2. Switch Novus prompt builder to V2 retrieval.
3. Keep strict token budget and ranking metrics.

Exit criteria:
- Novus answers preserve/improve personalization quality.
- no measurable p95 chat latency regression.

### Phase 3: Mentor Scoped Memory

1. Implement `loadMemoryContextV2(userId, { actor: 'mentor', mentorId })`.
2. Enable mentor write path to `owner_type='mentor'`.
3. Include compact global profile card in mentor prompts.

Exit criteria:
- mentor conversations retain domain continuity.
- no cross-mentor noise in mentor responses.

### Phase 4: UI/API Cutover

1. Replace memory panel data source with `memory_items`.
2. Replace file-based edit/delete endpoints.
3. Add filters and provenance display.

Exit criteria:
- user can inspect/edit/delete memory items directly.

### Phase 5: Decommission `memory_files`

1. Remove file-parser/serializer dependencies.
2. Remove old endpoints and reader/writer code.
3. Drop `memory_files` table after final verification.

Exit criteria:
- no runtime references to `memory_files`.
- migration complete with no data loss.

---

## Success Metrics

Quality:
- higher memory precision (fewer irrelevant recalls per response)
- higher memory recall coverage (important user facts referenced when relevant)
- lower contradiction rate (stale facts used after updates)

Performance:
- no chat response latency regression (memory write remains async)
- retrieval query p95 within target (set after baseline measurement)

Operational:
- low duplicate memory growth
- clear provenance for memory audit/debugging

---

## Risks and Mitigations

1. Over-extraction (memory spam)
- Mitigation: stricter extractor prompt + per-turn candidate cap + confidence threshold.

2. Retrieval bloat
- Mitigation: hard token budget + ranking + dedupe + max items cap.

3. Hallucinated memory entries
- Mitigation: provenance required, low-confidence threshold, optional review queue for sensitive items.

4. Schema lock-in
- Mitigation: keep `type` extensible and avoid over-normalizing too early.

---

## Open Decisions (Need Product Input)

1. Exact initial token budget for memory block.
2. Whether mentors can read all global facts or only profile subset.
3. Whether deleted items are soft-deleted forever or hard-pruned after retention window.
4. Whether to expose per-item sharing controls in v1 of this migration (recommend: no).
5. Standardize schema naming: app code currently uses `mentors`; docs/migrations also reference `experts`.

---

## Recommended Next Step

Implement Phase 0 + Phase 1 first (schema + Haiku JSON extraction + deterministic merge).  
Do not migrate UI until retrieval quality is validated on real conversations.

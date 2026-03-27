# Memory

## Overview

Keen has a persistent memory system that remembers facts about the user across conversations. Memory is stored as atomic rows in a `memory_items` table in Supabase, extracted by an LLM-powered agent after each conversation, and injected into the system prompt at chat time.

Users can view, edit, and delete their memories through a slide-out panel in the home page.

### How It Works

1. **User sends a message** and receives a response
2. **After the response is sent**, a background agent (`next/server` `after()` callback) analyzes the conversation and extracts new memory candidates
3. **On the next chat**, stored memories are loaded, ranked, and injected into the system prompt so the LLM can reference them naturally

The system never blocks the chat response — memory extraction is fully async.

### Memory Scoping

- **Keen conversations**: read all active memory items (global + all mentor-owned), write global items
- **Mentor conversations**: read mentor-owned items + compact global profile card, write mentor-owned items

## Roadmap

The current implementation is the v2 system (`memory_items`). The original v1 (`memory_files` — markdown blob-based) has been fully decommissioned. The old `/api/memory` endpoint returns 410 Deprecated.

Areas for future work:
- Embedding quality improvements and retrieval tuning
- User-facing memory search/filter UI
- Memory provenance display (which conversation a memory came from)
- Memory pinning and "never use" controls

## Implementation

### Architecture

```
User sends message
        |
        v
  Chat API (route.ts)
        |
        +---> loadMemoryContextV2() ---> loads memory_items ---> ranks and injects into system prompt
        |
        v
  LLM generates response
        |
        v
  after() callback
        |
        v
  processMemoryV2() ---> Haiku generates JSON candidates ---> deterministic merge/upsert into memory_items
        |
        v
  upsertMemoryItemEmbeddings() ---> generates text-embedding-3-small vectors ---> stores in memory_item_embeddings
```

### Data Model

#### `memory_items` table

Each row is a single atomic fact. Key columns:

| Column | Purpose |
|--------|---------|
| `owner_type` | `'global'` or `'mentor'` — scoping |
| `owner_id` | Mentor ID if mentor-owned, null if global |
| `type` | Category string (e.g. `profile`, `preference`, `project`, `person`) |
| `text` | The atomic memory statement |
| `normalized_text` | Lowercased, stripped version for dedup |
| `confidence` | 0-1 model confidence |
| `salience` | 0-100 importance score |
| `stability` | `'stable'` (long-term facts) or `'episodic'` (transient events) |
| `sensitivity` | `'normal'`, `'private'`, or `'sensitive'` |
| `status` | `'active'`, `'superseded'`, or `'deleted'` |
| `source_conversation_id` / `source_message_id` | Provenance tracking |

#### `memory_item_embeddings` table

Stores `text-embedding-3-small` (1536-dim) vectors for semantic retrieval. One embedding per active memory item. A Supabase RPC function `match_memory_items` performs cosine similarity search.

### Key Files

| File | Role |
|------|------|
| `frontend/lib/memory-items.ts` | Types (`MemoryItem`, `MemoryScope`, etc.), normalization, similarity functions, constants |
| `frontend/lib/memory-items-server.ts` | Server-side read path: `loadMemoryContextV2()`, embedding upsert/delete, scoring and ranking |
| `frontend/lib/memory-reader.ts` | Re-exports `loadMemoryContextV2` and legacy `loadMemoryContext` (both delegate to `memory-items-server.ts`) |
| `frontend/lib/memory-agent.ts` | Write path: `processMemoryV2()` extracts candidates via `generateObject()` with Haiku, runs deterministic merge |
| `frontend/app/api/memory/items/route.ts` | `GET /api/memory/items` — list items with scope/status filters |
| `frontend/app/api/memory/items/[id]/route.ts` | `PATCH` and `DELETE /api/memory/items/:id` — edit or soft-delete individual items |
| `frontend/app/api/memory/route.ts` | Deprecated v1 endpoint (returns 410) |
| `frontend/app/home/components/useMemory.ts` | React hook: loads, updates, deletes memory items with optimistic UI |
| `frontend/app/home/components/MemoryPanel.tsx` | Slide-out panel displaying all memories |
| `frontend/app/home/components/MemoryEntry.tsx` | Individual memory entry component (view/edit/delete) |

### Read Path

`loadMemoryContextV2()` in `memory-items-server.ts` assembles memory context in three ranked blocks:

1. **Core Profile** — stable, high-salience items (up to 9 for Keen, 6 for mentors). Scored by salience (52%), confidence (20%), recency (16%), plus bonuses for global ownership and core profile types.

2. **Relevant Recall** — items matching the current query via semantic + lexical similarity (up to 16 for Keen, 12 for mentors). Scored by semantic similarity (50%), lexical overlap (20%), salience (15%), recency (7%), confidence (8%).

3. **Recent Episodic** — recent episodic items not already selected (up to 8). Scored by salience (40%), recency (40%), confidence (20%).

All three blocks are trimmed to a token budget (800-1200 tokens, default 1000) and item cap (20-35 items, default 28). Trimming drops episodic first, then relevant, then core (keeping a minimum of 3 core items for Keen, 2 for mentors).

Semantic scoring uses OpenAI `text-embedding-3-small` embeddings. The system first tries an RPC call (`match_memory_items`), falling back to loading embedding rows in chunks and computing cosine similarity client-side.

### Write Path

`processMemoryV2()` in `memory-agent.ts`:

1. Takes the last 8 conversation messages + latest assistant response
2. Calls `generateObject()` with `MEMORY_MODEL` (Claude Haiku 4.5) using a structured JSON schema
3. Haiku outputs up to 16 candidates, each with: `type`, `text`, `stability`, `sensitivity`, `salience`, `confidence`, `action` (`insert`/`update`/`ignore`)
4. Deterministic merge logic:
   - Finds exact matches by `normalized_text` within the same `type` — updates in place
   - Finds near-duplicates via Jaccard similarity (threshold 0.86) — merges
   - For `action=update` with moderate similarity (threshold 0.45) — supersedes old item and inserts new
   - Otherwise inserts as new item
5. Generates embeddings for all new/updated items via `upsertMemoryItemEmbeddings()`

Mentor conversations write to `owner_type='mentor'` scoped items. Keen conversations write to `owner_type='global'`.

### API

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/memory/items?scope=all\|global\|mentor:<id>&status=active` | GET | List memory items |
| `/api/memory/items/:id` | PATCH | Update item fields (text, type, stability, sensitivity, status, salience, confidence) |
| `/api/memory/items/:id` | DELETE | Soft-delete (sets `status='deleted'`, removes embedding) |

All endpoints authenticate via Supabase and scope to the current user. PATCH re-generates the embedding for active items. DELETE removes the embedding.

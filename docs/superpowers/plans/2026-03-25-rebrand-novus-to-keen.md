# Rebrand Novus → Keen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the project from "Novus" to "Keen" across all code, config, docs, and user-facing strings. Change the internal `MemoryActor` value from `'novus'` to `'default'`.

**Architecture:** Global find-and-replace organized by layer — types/lib first (since components depend on them), then UI components, then API routes, then backend, then config, then docs. No DB migration needed — the `MemoryActor` type is code-only logic, not a stored value.

**Tech Stack:** Next.js (TypeScript), FastAPI (Python), Supabase config (TOML), Markdown docs

---

## File Map

### Types & Lib (change first — other code depends on these)
- Modify: `frontend/lib/memory-items.ts` — `MemoryActor` type: `'novus'` → `'default'`
- Modify: `frontend/lib/memory-reader.ts` — default param `'novus'` → `'default'`
- Modify: `frontend/lib/memory-agent.ts` — system prompt string
- Modify: `frontend/lib/theme.ts` — `STORAGE_KEY`: `'novus-theme'` → `'keen-theme'`

### Frontend Pages & Components
- Modify: `frontend/app/layout.tsx` — metadata title
- Modify: `frontend/app/page.tsx` — landing page brand strings (header, hero, footer)
- Modify: `frontend/app/login/page.tsx` — sign-in/sign-up copy
- Modify: `frontend/app/home/page.tsx` — `TTS_STORAGE_KEY`, `handleSelectNovus` → `handleSelectDefault`, `activeName` fallback
- Modify: `frontend/app/home/components/useHomeData.ts` — `mentor_name` fallback
- Modify: `frontend/app/home/components/useHomeThreads.ts` — CSS highlight class names
- Modify: `frontend/app/home/components/ChatComposer.tsx` — temporary mode helper text
- Modify: `frontend/app/home/components/SidePanel.tsx` — prop name + usage
- Modify: `frontend/app/home/components/ConversationsPanel.tsx` — prop name, UI strings

### API Routes
- Modify: `frontend/app/api/chat/route.ts` — `BASE_SYSTEM_PROMPT` identity, actor param
- Modify: `frontend/app/api/mentors/generate/route.ts` — system prompt string

### Backend (Python)
- Modify: `backend/routes/health.py` — service name
- Modify: `backend/routes/deepgram.py` — comment string

### Config
- Modify: `supabase/config.toml` — `project_id`
- Modify: `README.md` — project title

### Tests
- Modify: `frontend/__tests__/lib/memory-integration.test.ts` — actor values and comments

### Docs (bulk update)
- Modify: `docs/outline.md`
- Modify: `docs/architecture.md`
- Modify: `docs/features/mentors.md`
- Modify: `docs/features/memory.md`
- Modify: `docs/features/live-search.md`
- Modify: `docs/tests/memory-tests.md`
- Modify: `docs/plans/2026-03-05-full-ui-redesign.md`
- Modify: `docs/plans/2026-03-05-full-ui-redesign-design.md`

---

### Task 1: Rename MemoryActor type and lib defaults

**Files:**
- Modify: `frontend/lib/memory-items.ts:13`
- Modify: `frontend/lib/memory-reader.ts:19`
- Modify: `frontend/lib/memory-agent.ts:17`

- [ ] **Step 1: Update MemoryActor type**

In `frontend/lib/memory-items.ts`, change line 13:
```typescript
// Before:
export type MemoryActor = 'novus' | 'mentor';
// After:
export type MemoryActor = 'default' | 'mentor';
```

- [ ] **Step 2: Update default param in memory-reader**

In `frontend/lib/memory-reader.ts`, change line 19:
```typescript
// Before:
  actor: MemoryActor = 'novus',
// After:
  actor: MemoryActor = 'default',
```

- [ ] **Step 3: Update memory agent prompt**

In `frontend/lib/memory-agent.ts`, change line 17:
```typescript
// Before:
const MEMORY_V2_AGENT_PROMPT = `You are the Novus memory extraction agent.
// After:
const MEMORY_V2_AGENT_PROMPT = `You are the Keen memory extraction agent.
```

- [ ] **Step 4: Update tests**

In `frontend/__tests__/lib/memory-integration.test.ts`, replace all `actor: 'novus'` with `actor: 'default'` and update the comment on line 439:
```typescript
// Before:
    // Core profile should have at least 3 items (novus minimum)
// After:
    // Core profile should have at least 3 items (default minimum)
```

- [ ] **Step 5: Run tests to verify nothing breaks**

Run: `cd frontend && npx jest --testPathPattern=memory-integration --no-coverage`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add frontend/lib/memory-items.ts frontend/lib/memory-reader.ts frontend/lib/memory-agent.ts frontend/__tests__/lib/memory-integration.test.ts
git commit -m "refactor: rename MemoryActor 'novus' to 'default'"
```

---

### Task 2: Rename theme and localStorage keys

**Files:**
- Modify: `frontend/lib/theme.ts:12`
- Modify: `frontend/app/home/page.tsx:41`
- Modify: `frontend/app/home/components/useHomeThreads.ts:6-8`

- [ ] **Step 1: Update theme storage key**

In `frontend/lib/theme.ts`, change line 12:
```typescript
// Before:
export const STORAGE_KEY = "novus-theme";
// After:
export const STORAGE_KEY = "keen-theme";
```

- [ ] **Step 2: Update TTS storage key**

In `frontend/app/home/page.tsx`, change line 41:
```typescript
// Before:
const TTS_STORAGE_KEY = 'novus-tts-enabled';
// After:
const TTS_STORAGE_KEY = 'keen-tts-enabled';
```

- [ ] **Step 3: Update CSS highlight class names**

In `frontend/app/home/components/useHomeThreads.ts`, change lines 6-8:
```typescript
// Before:
const ACTIVE_SELECTION_HIGHLIGHT = 'novus-active-selection';
const HIGHLIGHT_STYLE_ID = 'novus-active-selection-styles';
// After:
const ACTIVE_SELECTION_HIGHLIGHT = 'keen-active-selection';
const HIGHLIGHT_STYLE_ID = 'keen-active-selection-styles';
```

- [ ] **Step 4: Verify dev server starts without errors**

Run: `cd frontend && npx next build --no-lint 2>&1 | tail -5`
Expected: Build succeeds (or at minimum no errors related to these changes)

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/theme.ts frontend/app/home/page.tsx frontend/app/home/components/useHomeThreads.ts
git commit -m "refactor: rename localStorage and CSS keys from novus to keen"
```

---

### Task 3: Rename user-facing strings in pages

**Files:**
- Modify: `frontend/app/layout.tsx:20`
- Modify: `frontend/app/page.tsx:59,103,233`
- Modify: `frontend/app/login/page.tsx:104-105`
- Modify: `frontend/app/home/page.tsx:237,567,692`
- Modify: `frontend/app/home/components/useHomeData.ts:115`
- Modify: `frontend/app/home/components/ChatComposer.tsx:82-83`

- [ ] **Step 1: Update layout metadata**

In `frontend/app/layout.tsx`, change line 20:
```typescript
// Before:
  title: "Novus",
// After:
  title: "Keen",
```

- [ ] **Step 2: Update landing page**

In `frontend/app/page.tsx`:
- Line 59: `Novus` → `Keen`
- Line 103: `Novus listens` → `Keen listens`
- Line 233: `© 2026 Novus` → `© 2026 Keen`

- [ ] **Step 3: Update login page**

In `frontend/app/login/page.tsx`:
- Line 104: `'Sign up to start using Novus'` → `'Sign up to start using Keen'`
- Line 105: `'Sign in to your Novus account'` → `'Sign in to your Keen account'`

- [ ] **Step 4: Update home page function and display names**

In `frontend/app/home/page.tsx`:
- Line 237: rename `handleSelectNovus` → `handleSelectDefault` (definition only; line 681 prop assignment is updated in Task 4)
- Line 567: `activeMentor?.name || 'Novus'` → `activeMentor?.name || 'Keen'`
- Line 692: `handleSelectNovus()` → `handleSelectDefault()`

- [ ] **Step 5: Update useHomeData fallback**

In `frontend/app/home/components/useHomeData.ts`, line 115:
```typescript
// Before:
        mentor_name: mentor?.name || 'Novus',
// After:
        mentor_name: mentor?.name || 'Keen',
```

- [ ] **Step 6: Update ChatComposer temporary mode text**

In `frontend/app/home/components/ChatComposer.tsx`, lines 82-83:
```typescript
// Before:
      ? 'Novus can use saved memories for context, but nothing from this chat is retained.'
      : 'Novus will not read or save any memory for this chat.';
// After:
      ? 'Keen can use saved memories for context, but nothing from this chat is retained.'
      : 'Keen will not read or save any memory for this chat.';
```

- [ ] **Step 7: Commit**

```bash
git add frontend/app/layout.tsx frontend/app/page.tsx frontend/app/login/page.tsx frontend/app/home/page.tsx frontend/app/home/components/useHomeData.ts frontend/app/home/components/ChatComposer.tsx
git commit -m "refactor: rename user-facing Novus strings to Keen"
```

---

### Task 4: Rename component props and panel strings

**Files:**
- Modify: `frontend/app/home/components/SidePanel.tsx:13,32,108`
- Modify: `frontend/app/home/components/ConversationsPanel.tsx:20,39,72,96,101`

- [ ] **Step 1: Update SidePanel prop**

In `frontend/app/home/components/SidePanel.tsx`:
- Line 13: `onNewNovusChat: () => void;` → `onNewDefaultChat: () => void;`
- Line 32: `onNewNovusChat,` → `onNewDefaultChat,`
- Line 108: `onNewNovusChat();` → `onNewDefaultChat();`

- [ ] **Step 2: Update ConversationsPanel prop and strings**

In `frontend/app/home/components/ConversationsPanel.tsx`:
- Line 20: `onNewNovusChat: () => void;` → `onNewDefaultChat: () => void;`
- Line 39: `onNewNovusChat,` → `onNewDefaultChat,`
- Line 72: `Unified history across Novus and mentors` → `Unified history across Keen and mentors`
- Line 96: `onNewNovusChat();` → `onNewDefaultChat();`
- Line 101: `New Novus Chat` → `New Chat`

- [ ] **Step 3: Update home page prop references**

In `frontend/app/home/page.tsx`, line 681:
```typescript
// Before (after Task 3 renamed the function):
        onNewNovusChat={handleSelectDefault}
// After:
        onNewDefaultChat={handleSelectDefault}
```

- [ ] **Step 4: Verify TypeScript compilation**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add frontend/app/home/components/SidePanel.tsx frontend/app/home/components/ConversationsPanel.tsx frontend/app/home/page.tsx
git commit -m "refactor: rename onNewNovusChat prop to onNewDefaultChat"
```

---

### Task 5: Rename API routes and system prompts

**Files:**
- Modify: `frontend/app/api/chat/route.ts:24,425,436`
- Modify: `frontend/app/api/mentors/generate/route.ts:24`

- [ ] **Step 1: Update chat route system prompt**

In `frontend/app/api/chat/route.ts`:
- Line 24: `You are Novus, a voice-native thinking partner.` → `You are Keen, a voice-native thinking partner.`
- Line 425: `actor: isMentorConversation ? 'mentor' : 'novus'` → `actor: isMentorConversation ? 'mentor' : 'default'`
- Line 436: `// Build Novus or mentor system prompt.` → `// Build Keen or mentor system prompt.`

- [ ] **Step 2: Update mentor generator prompt**

In `frontend/app/api/mentors/generate/route.ts`, line 24:
```typescript
// Before:
const MENTOR_GENERATOR_SYSTEM_PROMPT = `You are a mentor persona designer for Novus.
// After:
const MENTOR_GENERATOR_SYSTEM_PROMPT = `You are a mentor persona designer for Keen.
```

- [ ] **Step 3: Commit**

```bash
git add frontend/app/api/chat/route.ts frontend/app/api/mentors/generate/route.ts
git commit -m "refactor: rename Novus to Keen in API routes and system prompts"
```

---

### Task 6: Rename backend and config

**Files:**
- Modify: `backend/routes/health.py:11,20`
- Modify: `backend/routes/deepgram.py:25`
- Modify: `supabase/config.toml:5`
- Modify: `README.md:1`

- [ ] **Step 1: Update backend health routes**

In `backend/routes/health.py`:
- Line 11: `"service": "novus-backend"` → `"service": "keen-backend"`
- Line 20: `"service": "novus-backend"` → `"service": "keen-backend"`

- [ ] **Step 2: Update deepgram route comment**

In `backend/routes/deepgram.py`, line 25:
```python
# Before:
        "comment": "Novus browser token",
# After:
        "comment": "Keen browser token",
```

- [ ] **Step 3: Update supabase config**

In `supabase/config.toml`, line 5:
```toml
# Before:
project_id = "novus"
# After:
project_id = "keen"
```

- [ ] **Step 4: Update README**

In `README.md`, line 1:
```markdown
# Before:
# Novus
# After:
# Keen
```

- [ ] **Step 5: Commit**

```bash
git add backend/routes/health.py backend/routes/deepgram.py supabase/config.toml README.md
git commit -m "refactor: rename Novus to Keen in backend, config, and README"
```

---

### Task 7: Update all documentation

**Files:**
- Modify: `docs/outline.md`
- Modify: `docs/architecture.md`
- Modify: `docs/features/mentors.md`
- Modify: `docs/features/memory.md`
- Modify: `docs/features/live-search.md`
- Modify: `docs/tests/memory-tests.md`
- Modify: `docs/plans/2026-03-05-full-ui-redesign.md`
- Modify: `docs/plans/2026-03-05-full-ui-redesign-design.md`

- [ ] **Step 1: Bulk replace in docs**

For each file listed above, replace all occurrences of:
- `Novus` → `Keen` (brand name in prose)
- `novus` → `keen` (in code snippets, CSS class names, localStorage keys within docs)

Special cases in code snippets within docs:
- `'novus'` actor references in `docs/tests/memory-tests.md` → `'default'`
- `novus-theme` in `docs/plans/2026-03-05-full-ui-redesign.md` → `keen-theme`
- `novus-active-selection` in plan docs → `keen-active-selection`
- `onNewNovusChat` in plan docs → `onNewDefaultChat`

- [ ] **Step 2: Verify no remaining occurrences**

Run: `grep -ri 'novus' docs/`
Expected: No matches

- [ ] **Step 3: Commit**

```bash
git add docs/
git commit -m "docs: rename Novus to Keen across all documentation"
```

---

### Task 8: Final verification sweep

- [ ] **Step 1: Search for any remaining "novus" references in source**

Run: `grep -ri 'novus' --include='*.ts' --include='*.tsx' --include='*.py' --include='*.toml' --include='*.md' . | grep -v node_modules | grep -v '.next'`
Expected: No matches (or only this plan file)

- [ ] **Step 2: Run full test suite**

Run: `cd frontend && npx jest --no-coverage 2>&1 | tail -10`
Expected: All tests pass

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Verify dev server starts**

Run: `cd frontend && timeout 15 npx next build --no-lint 2>&1 | tail -5`
Expected: Build succeeds

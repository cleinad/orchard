# Conversation Map UI Refresh Implementation Plan

**Goal:** Replace the current conversation map rendering with the approved editorial note-card design while preserving the existing map shell, branch-routing semantics, desktop/mobile surfaces, and transcript-native branch behavior.

## Constraints And Current Shape

- The map shell already exists. This work is a renderer and interaction reset, not a greenfield map feature.
- `frontend/app/home/components/conversationMapModel.ts` already owns pure map projection logic, route selection patches, and zoom-collapse segments. It currently models separate message nodes instead of merged turn cards.
- `frontend/app/home/components/ConversationMap.tsx` currently owns all rendering, pan/zoom, hover state, and the bottom preview dock. It is the primary rewrite target.
- `frontend/app/home/[[...conversationId]]/page.tsx` already owns transcript scroll tracking, route activation, map open state, map/thread-panel exclusivity, and desktop/mobile layout wiring.
- `frontend/app/home/components/useConversationMapState.ts` already persists per-conversation split ratio and camera state in local storage.
- `frontend/e2e/conversation-map.spec.js` already covers split-pane open, resize, route activation, mobile takeover, and map closing when inline-thread UI opens. It should be refreshed, not replaced.
- `frontend/app/components/Tooltip.tsx` currently keeps the tooltip open when pointer moves from trigger into the tooltip. That is the opposite of the approved node-preview behavior. The map preview should stay local to `ConversationMap.tsx` instead of changing global tooltip behavior.

## File Map

- Modify: `frontend/app/home/components/conversationMapModel.ts`
  - Re-project the tree as merged turn cards instead of separate user/assistant pills, while preserving route-selection helpers and stable lane assignment.
- Modify: `frontend/__tests__/app/home/conversation-map-model.test.ts`
  - Extend model tests for merged turn-card output, navigation anchors, lane stability, and zoom-collapse behavior.
- Modify: `frontend/app/home/components/ConversationMap.tsx`
  - Replace the current SVG pill renderer, bottom preview strip, all-caps header treatment, and detached inspector with the approved card-based map UI and local hover preview.
- Modify: `frontend/app/home/[[...conversationId]]/page.tsx`
  - Keep the existing map shell, but tighten map/thread exclusivity, node-click transcript sync, and already-active-node scroll behavior.
- Modify: `frontend/app/home/components/useConversationMapState.ts`
  - Adjust any view-state defaults or clamping needed for the new card geometry without changing the persistence boundary.
- Modify: `frontend/app/home/components/ConversationMapToggle.tsx`
  - Update the entry affordance only if the new map chrome makes the existing icon or tooltip wording feel out of place.
- Modify: `frontend/e2e/conversation-map.spec.js`
  - Refresh selectors and assertions to match merged turn cards, tooltip behavior, and stronger transcript-sync guarantees.
- Modify: `docs/design/design-language.md`
  - Add the approved “no all caps in product UI” rule.
- Modify: `docs/features/conversation-branching.md`
  - Update the feature doc to describe the shipped map UI accurately once implementation lands.

## Task 1: Rework The Pure Map Model Around Merged Turn Cards

**Files:**
- Modify: `frontend/app/home/components/conversationMapModel.ts`
- Test: `frontend/__tests__/app/home/conversation-map-model.test.ts`

- [ ] Add or update failing model tests first for:
  - merged turn-card output built from prompt + following assistant response
  - preserving a usable node when a prompt exists without a following assistant response yet
  - stable lane placement when switching between `Main` and sibling branches
  - route selection patches for deep nested targets
  - assistant-target navigation anchoring on the prompting user message
  - zoom-collapse behavior that does not swallow fork points
- [ ] Introduce a merged-node model shape that carries, at minimum:
  - stable rendered node id
  - prompt message id
  - response message id when present
  - prompt content
  - response content
  - lane/depth/edge metadata
  - active/current state
- [ ] Keep `getRouteSelectionPatch()` pure and unchanged in purpose.
- [ ] Keep `getMapNavigationAnchorMessageId()` anchored to the user prompt for assistant-response selections.
- [ ] Make sure the rendered node id remains predictable for browser tests. Prefer the assistant response id when present; fall back to the prompt id only when there is no response yet.
- [ ] Run `cd frontend && npm test -- __tests__/app/home/conversation-map-model.test.ts`
- [ ] Verify the new model stays DOM-free and reusable from both desktop and mobile map surfaces.
- [ ] Commit with `refactor: model merged conversation map turns`

**Completion criteria:**
- The pure model exposes merged turn-card data instead of separate user and assistant pills.
- Clicking a rendered node can still activate the full branch route required to reach it.
- Lane assignment and collapse logic stay stable across branch switches.

## Task 2: Rewrite The Map Renderer Around Editorial Note Cards

**Files:**
- Modify: `frontend/app/home/components/ConversationMap.tsx`
- Modify: `frontend/app/home/components/useConversationMapState.ts`
- Modify: `frontend/app/home/components/ConversationMapToggle.tsx`

- [ ] Replace the current tiny oval node treatment with restrained landscape cards at roughly a `3:2` ratio.
- [ ] Render each node with:
  - one always-visible prompt line
  - `2-3` readable lines of assistant-response preview
  - minimal state treatment only when needed
- [ ] Remove visible branch titles from the map UI entirely.
- [ ] Remove the bottom preview strip and any inspector-like footer.
- [ ] Replace the current all-caps panel microcopy with sentence-case or title-case copy only.
- [ ] Simplify the background and connector language so the tree feels architectural and quiet instead of decorative or bubbly.
- [ ] Keep pan/zoom support, but retune default framing and zoom clamping if the larger cards need different bounds.
- [ ] Implement a map-local hover/focus preview system inside `ConversationMap.tsx`:
  - anchored beside the hovered node
  - fuller prompt + longer assistant excerpt
  - disappears immediately on pointer leave
  - closes on blur for keyboard focus
  - does not become hoverable itself
- [ ] Do not reuse `frontend/app/components/Tooltip.tsx` for node previews, since its pointer-enter persistence model conflicts with the approved interaction.
- [ ] Preserve existing `data-testid` hooks for desktop/mobile surfaces and keep predictable `data-map-node-id` targeting for test and route-selection stability.
- [ ] Run `cd frontend && npm run lint -- app/home/components/ConversationMap.tsx app/home/components/useConversationMapState.ts app/home/components/ConversationMapToggle.tsx`
- [ ] Verify manually that the map remains readable at medium pane widths and does not regress into unreadable mini-cards.
- [ ] Commit with `feat: redesign conversation map rendering`

**Completion criteria:**
- The shipped map no longer looks like a set of pills or bubbles.
- Every resting node is meaningfully readable without hover.
- Hover/focus preview is local to the node and not a second docked panel.

## Task 3: Tighten Transcript Sync And Surface Exclusivity

**Files:**
- Modify: `frontend/app/home/[[...conversationId]]/page.tsx`
- Modify: `frontend/app/home/components/ConversationMap.tsx`

- [ ] Audit `handleSelectMessageFromMap` and related route-activation code so clicking a node always:
  - updates selection state immediately
  - applies the full route patch
  - clears incompatible pending branch state
  - scrolls the transcript target into view
- [ ] Preserve the user-prompt anchor behavior for assistant-response selections so the left transcript opens at the right context.
- [ ] Make already-active node clicks scroll the left transcript again instead of short-circuiting.
- [ ] Keep the existing transcript scroll tracking that feeds `currentMessageId`, but make sure the new merged node model highlights the correct rendered card.
- [ ] Treat map/thread-panel exclusivity as a first-class shared rule:
  - opening the map closes the thread panel
  - opening inline thread UI closes the map
  - opening the thread panel from any route closes the map
- [ ] Keep the existing desktop split-pane and mobile takeover surfaces intact while swapping in the new renderer.
- [ ] Run `cd frontend && npm run lint -- app/home/[[...conversationId]]/page.tsx app/home/components/ConversationMap.tsx`
- [ ] Verify manually in the app that:
  - current-route highlighting follows transcript scroll
  - clicking a node on the active route still scrolls left
  - opening map and thread UI in sequence never leaves both visible
- [ ] Commit with `fix: harden conversation map navigation`

**Completion criteria:**
- Node clicks are deterministic and consistent.
- Transcript sync works even when the clicked node is already active.
- Map and thread surfaces never coexist.

## Task 4: Refresh Automated Coverage For The New UI Contract

**Files:**
- Modify: `frontend/__tests__/app/home/conversation-map-model.test.ts`
- Modify: `frontend/e2e/conversation-map.spec.js`

- [ ] Keep the existing fixture tree in `conversation-map.spec.js`, but update DOM assumptions from separate SVG pills to merged turn cards.
- [ ] Add or update Playwright assertions for:
  - merged turn card rendering using stable `data-map-node-id`
  - one-click route activation from a nested branch target
  - desktop resize still changing pane width
  - mobile takeover still returning to the transcript after navigation
  - inline-thread UI still closing the map
  - hover preview appearing beside a node and disappearing immediately on pointer leave
  - absence of visible branch-title chrome in the map
- [ ] Keep unit tests focused on model behavior and browser tests focused on rendering and interaction.
- [ ] Run `cd frontend && npm test -- __tests__/app/home/conversation-map-model.test.ts`
- [ ] Run `cd frontend && npx playwright test e2e/conversation-map.spec.js`
- [ ] Commit with `test: refresh conversation map coverage`

**Completion criteria:**
- The updated test suite matches the new merged-card UI contract.
- Route activation, resize, mobile takeover, tooltip behavior, and map/thread exclusivity stay covered.

## Task 5: Update Shipped Docs After Code Lands

**Files:**
- Modify: `docs/design/design-language.md`
- Modify: `docs/features/conversation-branching.md`

- [ ] Add a concise product-wide rule to the design language forbidding full-caps UI treatment in Keen product surfaces.
- [ ] Update the branching feature doc so the map section describes the shipped UI accurately:
  - merged prompt/response turn cards
  - no visible branch titles
  - local hover preview instead of bottom inspector
  - map/thread mutual exclusivity
- [ ] Keep the docs aligned with the shipped behavior, not the intermediate refactor steps.
- [ ] Run `rg -n \"CONVERSATION MAP|CURRENT TURN|ASSISTANT RESPONSE|THREADLINE VIEW\" docs/design/design-language.md docs/features/conversation-branching.md frontend/app/home/components/ConversationMap.tsx`
- [ ] Verify that any surviving uppercase strings are either normal prose or intentionally outside product UI.
- [ ] Commit with `docs: update conversation map guidance`

**Completion criteria:**
- The design language captures the no-all-caps rule.
- The feature doc matches the refreshed map UI rather than the superseded rendering.

## Recommended Execution Order

1. Task 1: model reshape
2. Task 2: renderer rewrite
3. Task 3: page integration and exclusivity hardening
4. Task 4: automated coverage refresh
5. Task 5: shipped docs update

## Verification Commands

Run these from the repo root unless noted otherwise:

```bash
cd frontend && npm test -- __tests__/app/home/conversation-map-model.test.ts
cd frontend && npm run lint -- app/home/components/conversationMapModel.ts app/home/components/ConversationMap.tsx app/home/components/useConversationMapState.ts app/home/components/ConversationMapToggle.tsx app/home/[[...conversationId]]/page.tsx
cd frontend && npx playwright test e2e/conversation-map.spec.js
```

If the renderer refactor affects shared home behavior beyond the map surface, also run:

```bash
cd frontend && npx playwright test e2e/inline-threads.spec.js e2e/persistent-inline-threads.spec.js
```

## Out Of Scope

- branch rename UI
- new persistence or API work for branches
- sidebar changes that expose branches as separate items
- side-by-side branch comparison
- replacing the existing map shell with a different product concept

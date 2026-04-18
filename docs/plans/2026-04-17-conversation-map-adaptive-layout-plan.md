# Conversation Map Adaptive Layout Implementation Plan

**Goal:** Replace the current rigid fixed-lane map layout with an adaptive subtree-aware layout that preserves depth ordering, keeps the active route as the spine, distributes sibling subtrees symmetrically, and prevents card overlap as the conversation tree grows.

## Constraints And Current Shape

- `frontend/app/home/components/conversationMapModel.ts` currently assigns a single integer `lane` during one recursive pass and treats that as the full horizontal layout model.
- `frontend/app/home/components/ConversationMap.tsx` currently converts `lane` directly into `x` using a fixed `LANE_GAP`, and connectors assume that rigid geometry.
- The refreshed node UI already uses merged turn cards, local hover preview, pan/zoom, and transcript-native route activation. This work should preserve those behaviors.
- The active route should remain visually privileged, but branch spread should become symmetric around that spine.
- Pane resize and zoom should continue to affect viewport/camera only, not trigger structural relayout.
- The existing tests cover route activation, resize, hover preview, and zoomed-out visibility. They do not yet cover adaptive subtree spacing or overlap prevention.

## File Map

- Modify: `frontend/app/home/components/conversationMapModel.ts`
  - Replace rigid lane assignment with subtree-aware horizontal layout data.
- Modify: `frontend/__tests__/app/home/conversation-map-model.test.ts`
  - Add model-level coverage for subtree envelopes, symmetric packing, local reflow, and non-overlap guarantees.
- Modify: `frontend/app/home/components/ConversationMap.tsx`
  - Render cards from computed x positions and update connectors to a softer adaptive geometry.
- Modify: `frontend/e2e/conversation-map.spec.js`
  - Add browser coverage for deep-branch layouts that previously overlapped and for stable navigation without broad relayout.
- Modify: `docs/features/conversation-branching.md`
  - Update the map section if shipped behavior changes materially from “stable deterministic lane layout” wording.

## Task 1: Replace Lane-Centric Layout With Subtree Measurement

**Files:**
- Modify: `frontend/app/home/components/conversationMapModel.ts`
- Test: `frontend/__tests__/app/home/conversation-map-model.test.ts`

- [ ] Add or update failing unit tests first for:
  - a deep nested branch that previously reused an occupied lane
  - symmetric child placement around a parent spine
  - subtree width increasing when descendants are added
  - stable node identity and route-selection behavior after layout refactor
- [ ] Introduce explicit horizontal layout data in the model, such as:
  - sibling order
  - ideal x
  - resolved x
  - subtree width or envelope width
- [ ] Keep depth-based vertical ordering unchanged.
- [ ] Keep merged turn-card projection unchanged in purpose.
- [ ] Preserve `getRouteSelectionPatch()` and `getMapNavigationAnchorMessageId()` semantics.
- [ ] Stop using integer `lane` as the only source of horizontal truth. It may remain as an ordering hint if that simplifies migration.
- [ ] Run `cd frontend && npm test -- __tests__/app/home/conversation-map-model.test.ts`
- [ ] Verify the model remains pure and renderer-agnostic.
- [ ] Commit with `refactor: measure conversation map subtrees`

**Completion criteria:**
- The model can describe subtree-aware horizontal layouts.
- Existing route-selection helpers still behave exactly as before.
- Deep branch structures no longer depend on hard-coded lane reuse.

## Task 2: Implement Top-Down Placement And Local Relaxation

**Files:**
- Modify: `frontend/app/home/components/conversationMapModel.ts`
- Test: `frontend/__tests__/app/home/conversation-map-model.test.ts`

- [ ] Implement a bottom-up subtree envelope pass.
- [ ] Implement a top-down ideal x assignment pass that:
  - keeps the current or main continuation closest to the spine
  - distributes siblings symmetrically around the parent
  - gives wider descendant subtrees more horizontal room
- [ ] Implement a deterministic horizontal relaxation pass that:
  - resolves overlap within each depth layer
  - pushes crowded neighbors apart
  - applies a soft pull back toward ideal x
  - keeps the current spine slightly stiffer than side branches
- [ ] Ensure structural tree changes can reflow nearby nodes outward without globally scrambling the whole tree.
- [ ] Ensure active-route changes alone do not trigger broad positional shifts.
- [ ] Run `cd frontend && npm test -- __tests__/app/home/conversation-map-model.test.ts`
- [ ] Verify the final layout is deterministic for the same input tree.
- [ ] Commit with `feat: add adaptive conversation map layout`

**Completion criteria:**
- The map layout becomes subtree-aware and symmetric.
- Local outward reflow is possible when branches deepen.
- Existing trees render without card overlap under normal spacing.

## Task 3: Update Rendering Geometry And Connectors

**Files:**
- Modify: `frontend/app/home/components/ConversationMap.tsx`

- [ ] Replace `lane`-based x positioning with the new computed layout coordinates from the model.
- [ ] Keep y positioning tied to depth.
- [ ] Remove any remaining assumptions that one lane equals one fixed column.
- [ ] Update connector paths from hard right-angle geometry to a softer adaptive shape:
  - short vertical exit from the parent card
  - shallow diagonal or bezier into the child
  - straighter feel on the active spine
- [ ] Ensure pan/zoom, pointer hit targets, tooltip anchoring, and current-path styling continue to work with the new coordinates.
- [ ] If helpful, animate transitions to new x positions with a short eased motion rather than instant jumps.
- [ ] Run `cd frontend && npx tsc --noEmit`
- [ ] Verify manually that deep sibling branches no longer collide and the tree feels balanced around the spine.
- [ ] Commit with `feat: render adaptive conversation tree geometry`

**Completion criteria:**
- Rendered cards follow the new adaptive positions.
- Connectors support outward-sliding branches without awkward elbows.
- The current route still reads as the calm central spine.

## Task 4: Refresh Automated Coverage For Overlap And Stability

**Files:**
- Modify: `frontend/__tests__/app/home/conversation-map-model.test.ts`
- Modify: `frontend/e2e/conversation-map.spec.js`

- [ ] Extend model tests to assert:
  - no overlap for representative multi-branch depth scenarios
  - symmetric sibling ordering around the spine
  - local outward reflow after adding descendants
  - stable positions when only branch selection changes
- [ ] Add or update Playwright assertions for:
  - a deep branch fixture that previously produced crowding
  - non-overlapping node bounding boxes after zoom-fit
  - continued correctness of route activation after layout changes
  - continued correctness of hover preview and resize behavior
- [ ] Keep browser tests focused on user-observable layout behavior, not internal layout numbers.
- [ ] Run `cd frontend && npm test -- __tests__/app/home/conversation-map-model.test.ts`
- [ ] Run `cd frontend && npx playwright test e2e/conversation-map.spec.js --workers=1`
- [ ] Commit with `test: cover adaptive conversation map layout`

**Completion criteria:**
- The layout refactor is protected by overlap- and stability-focused coverage.
- The suite still covers map navigation and hover behavior in addition to the new layout rules.

## Task 5: Align Shipped Docs With The New Layout Model

**Files:**
- Modify: `docs/features/conversation-branching.md`

- [ ] Replace any stale mention of stable deterministic lane layout with the shipped adaptive layout behavior.
- [ ] Document the key behavior changes succinctly:
  - depth stays fixed
  - the current route acts as the center spine
  - sibling subtrees distribute symmetrically
  - zoom and pane resize do not alter the structural layout
  - structural branch growth may reflow nearby nodes outward
- [ ] Keep the doc focused on product behavior rather than implementation details.
- [ ] Run `rg -n "lane|column|rigid|deterministic lane" docs/features/conversation-branching.md`
- [ ] Verify the doc matches the implementation that actually ships.
- [ ] Commit with `docs: describe adaptive conversation map layout`

**Completion criteria:**
- The branching doc matches the new tree behavior.
- No stale rigid-lane language remains in the shipped feature description.

## Recommended Execution Order

1. Task 1: subtree measurement
2. Task 2: adaptive placement and relaxation
3. Task 3: renderer geometry and connector update
4. Task 4: automated coverage refresh
5. Task 5: branching doc alignment

## Verification Commands

Run these from the repo root unless noted otherwise:

```bash
cd frontend && npm test -- __tests__/app/home/conversation-map-model.test.ts
cd frontend && npx tsc --noEmit
cd frontend && npx playwright test e2e/conversation-map.spec.js --workers=1
```

If connector geometry or camera behavior affects broader home interactions, also run:

```bash
cd frontend && npx playwright test e2e/inline-threads.spec.js e2e/persistent-inline-threads.spec.js --workers=1
```

## Out Of Scope

- manual graph dragging
- freeform force-directed layout
- branch rename UI
- side-by-side branch comparison
- persistence or API changes for conversation branches


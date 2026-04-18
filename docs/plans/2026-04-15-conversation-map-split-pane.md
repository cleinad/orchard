# Conversation Map Split-Pane Implementation Plan

**Goal:** Replace the current `BranchNavigator` overlay on `/home` with a true conversation map that opens as a resizable split pane on desktop and a temporary full-screen surface on mobile, while keeping transcript-native branch chips and the existing branch persistence model intact.

## Constraints And Current Shape

- No backend, migration, or Supabase schema work is required for this feature. The map is a new client-side projection of the existing `messages.previous_message_id`, `conversation_branches`, and `selectedBranchIds` model.
- `frontend/app/home/[[...conversationId]]/page.tsx` currently owns selected chat state, active-path projection, branch selection, scroll targeting, pending branch state, inline-thread orchestration, and the current `BranchNavigator` wiring.
- `frontend/app/home/components/conversationTree.ts` is the current source of truth for active-path projection and optimistic branch creation. The map must reuse the same tree semantics rather than inventing a second branch model.
- `frontend/app/home/components/useHomeThreads.ts` and `frontend/app/home/components/TextSelectionPopover.tsx` currently assume one transcript scroll container for selection anchoring and thread promotion. The split-pane work must preserve that behavior by keeping the transcript pane as the scroll container ref.
- `frontend/e2e/helpers/homeRouteMocks.js` currently mocks `messages` and `threads`, but not `conversation_branches`, so persistent branched map tests need new mock plumbing.
- `frontend/app/home/e2eFixtures.ts` currently only seeds inline-thread fixtures. Map coverage will need explicit branch-tree fixtures.

## File Map

- Delete: `frontend/app/home/components/BranchNavigator.tsx`
- Create: `frontend/app/home/components/conversationMapModel.ts`
  - Full-tree projection, deterministic lane assignment inputs, route activation for arbitrary nodes, active/current-path metadata, and zoom-collapse helpers.
- Create: `frontend/app/home/components/useConversationMapState.ts`
  - Per-conversation client-only UI state for open/closed state, split ratio, and camera memory.
- Create: `frontend/app/home/components/ConversationMapToggle.tsx`
  - The small sticky `Map` entry point that replaces the current branch-count pill.
- Create: `frontend/app/home/components/ConversationMap.tsx`
  - Shared map surface for desktop and mobile, including nodes, edges, hover preview, pan/zoom, and click-to-navigate behavior.
- Modify: `frontend/app/home/[[...conversationId]]/page.tsx`
  - Replace navigator state/wiring, move the scroll container to the transcript pane, integrate split-pane/mobile map layout, batch branch-route activation, transcript-sync state, and close-map rules for inline-thread UI.
- Modify: `frontend/app/home/components/conversationTree.ts`
  - Export or reuse shared normalization primitives so transcript and map logic stay in sync.
- Modify: `frontend/app/home/components/ConversationView.tsx`
  - Only if needed for stable selectors, transcript-pane layout hooks, or message-observer plumbing.
- Create: `frontend/__tests__/app/home/conversation-map-model.test.ts`
  - Node-only tests for route activation, lane stability, and collapse behavior.
- Modify: `frontend/app/home/e2eFixtures.ts`
  - Add deterministic branch-tree fixtures for temporary/local map coverage.
- Modify: `frontend/e2e/helpers/homeRouteMocks.js`
  - Mock `conversation_branches` plus branched `messages.previous_message_id` payloads for persistent conversations.
- Create: `frontend/e2e/conversation-map.spec.js`
  - Playwright coverage for desktop split view, mobile takeover, route activation, and inline-thread interaction boundaries.
- Modify: `docs/features/conversation-branching.md`
  - Replace the old navigator description with the shipped conversation-map behavior once implementation is complete.

## Task 1: Add A Pure Conversation Map Model

**Files:**
- Create: `frontend/app/home/components/conversationMapModel.ts`
- Modify: `frontend/app/home/components/conversationTree.ts`
- Test: `frontend/__tests__/app/home/conversation-map-model.test.ts`

- [ ] Add failing model tests first for:
  - nested branch trees
  - route activation to a non-active node
  - stable lane placement when switching between `Main` and sibling branches
  - compact collapse of long linear runs while preserving branch points
- [ ] Implement a shared tree-model layer that can derive:
  - the full top-level message graph from `messages` + `conversation_branches`
  - all branch points, not only the current active path
  - a deterministic `selectedBranchIds` patch for any clicked message node
  - active-path node ids and current-route metadata for rendering
  - stable lane metadata anchored on `Main`
  - zoom-driven collapse segments for long uninterrupted runs
- [ ] Refactor `conversationTree.ts` only enough to avoid transcript/map drift in normalization or branch-default rules.
- [ ] Run `npm run test -- __tests__/app/home/conversation-map-model.test.ts`
- [ ] Verify the helper contract is pure and reusable from both the page and the map component without touching browser APIs.
- [ ] Commit with `feat: add conversation map model`

**Completion criteria:**
- A clicked node can be mapped to the full branch-route selection required to reach it.
- Lane assignment remains stable when the active branch changes.
- The model stays independent of React and DOM state.

## Task 2: Replace The Navigator With The Map Shell

**Files:**
- Delete: `frontend/app/home/components/BranchNavigator.tsx`
- Create: `frontend/app/home/components/ConversationMapToggle.tsx`
- Create: `frontend/app/home/components/useConversationMapState.ts`
- Modify: `frontend/app/home/[[...conversationId]]/page.tsx`
- Modify: `frontend/app/home/components/ConversationView.tsx`

- [ ] Replace `branchNavigatorOpen` and `branchNavigatorItems` in `page.tsx` with conversation-map state keyed by the selected chat key.
- [ ] Add a sticky `Map` button in the current top-right slot and show it only when the conversation has at least one real branch point.
- [ ] Move the existing `containerRef` scroll ownership to the transcript pane so `jumpToMessage`, selection anchoring, and thread promotion still operate against the transcript rather than the outer split layout.
- [ ] On desktop, render a clamped resizable split inside the main chat surface with a default width near `65% transcript / 35% map`.
- [ ] On mobile, open the map as a full-screen temporary takeover with an explicit close/back control.
- [ ] Persist map UI state per conversation in client storage only:
  - split ratio
  - camera position/zoom
  - any transient follow-mode pause state
- [ ] Add explicit close rules:
  - opening an inline-thread popover closes the map
  - opening the `ThreadPanel` closes the map
  - closing the map restores a full-width transcript without disturbing the current branch selection
- [ ] Add stable `data-testid` hooks for the map toggle, desktop pane, mobile surface, and resize handle.
- [ ] Run `npm run lint -- app/home/[[...conversationId]]/page.tsx app/home/components/ConversationMapToggle.tsx app/home/components/useConversationMapState.ts`
- [ ] Verify the closed-map path still behaves correctly for persistent, draft, and temporary chats.
- [ ] Commit with `feat: add conversation map shell`

**Completion criteria:**
- The old overlay navigator is fully removed from the shipped UI.
- Desktop and mobile both have a map entry point, but only desktop uses the split-pane layout.
- Inline-thread surfaces always win over the map.

## Task 3: Implement Interactive Map Rendering And Transcript Sync

**Files:**
- Create: `frontend/app/home/components/ConversationMap.tsx`
- Modify: `frontend/app/home/[[...conversationId]]/page.tsx`
- Modify: `frontend/app/home/components/ConversationView.tsx`

- [ ] Render the full tree as a stable top-to-bottom map surface with compact nodes and edges.
- [ ] Distinguish user and assistant nodes visually without turning the pane into a mini transcript.
- [ ] Highlight:
  - the full active path
  - the currently visible transcript message
  - the selected/hovered node
- [ ] Implement delayed hover preview anchored to the hovered node, with lightweight snippet content only.
- [ ] Add pan and zoom behavior with manual-control bias:
  - user gestures pause aggressive follow mode
  - reopening the map restores the last camera state for that conversation
  - zoomed-out mode uses the model’s collapse segments instead of rendering unreadable dust
- [ ] Track the current visible transcript location from the transcript scroll container and feed that into the map as the “current location” highlight.
- [ ] Replace one-fork-at-a-time selection updates with a batched route activation helper:
  - map node click computes the full route
  - updates `selectedBranchIds` for every required fork
  - clears incompatible `pendingBranch`
  - re-projects the transcript
  - scrolls to the clicked message via `jumpToMessage`
- [ ] Keep transcript-native branch chips in `ConversationView` as local controls and make sure chip changes update map highlighting without changing map lanes.
- [ ] Run `npm run test -- __tests__/app/home/conversation-map-model.test.ts`
- [ ] Run `npm run lint -- app/home/[[...conversationId]]/page.tsx app/home/components/ConversationMap.tsx`
- [ ] Verify manually in responsive mode that:
  - clicking a map node jumps to the correct transcript message
  - non-`Main` branches stay off-center
  - reopening the map restores prior camera state for that conversation
- [ ] Commit with `feat: add interactive conversation map`

**Completion criteria:**
- The map is a real navigation surface, not only a visualization.
- Layout stays spatially stable when the user switches branches.
- Current transcript position is visible in the map without constant re-centering.

## Task 4: Add Fixture Coverage And Update Shipped Docs

**Files:**
- Modify: `frontend/app/home/e2eFixtures.ts`
- Modify: `frontend/e2e/helpers/homeRouteMocks.js`
- Create: `frontend/e2e/conversation-map.spec.js`
- Modify: `docs/features/conversation-branching.md`

- [ ] Extend the Playwright mock layer to serve `conversation_branches` rows and branched `messages` with `previous_message_id`.
- [ ] Add deterministic fixtures for:
  - a simple fork with `Main` plus one sibling
  - a nested branch tree
  - an active non-`Main` route
  - a temporary-chat branch tree
- [ ] Add Playwright coverage for:
  - opening and closing the desktop map
  - resizing the desktop split
  - clicking a node to activate a full route and scroll the transcript
  - mobile map takeover open/select/return flow
  - inline-thread popover or `ThreadPanel` closing the map
  - restoring map camera state after reopening the same conversation
- [ ] Update `docs/features/conversation-branching.md` so the feature doc matches the shipped map behavior and no longer describes the old overlay navigator as current behavior.
- [ ] Run `npm run test:e2e -- conversation-map.spec.js`
- [ ] Run `npm run lint -- e2e/conversation-map.spec.js e2e/helpers/homeRouteMocks.js app/home/e2eFixtures.ts`
- [ ] Commit with `test: cover conversation map flows`

**Completion criteria:**
- The new map behavior is covered in both pure-model tests and browser-level interaction tests.
- Persistent and temporary chats both exercise the map with deterministic mocked data.
- The public feature doc describes the map instead of the retired navigator.

## Out Of Scope

- Supabase migrations or API contract changes for branches
- Branch rename UI
- Sidebar changes that expose branches as separate navigation items
- Side-by-side branch comparison or freeform graph canvas behavior

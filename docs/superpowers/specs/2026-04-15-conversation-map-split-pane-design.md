# Conversation Map Split-Pane Design

Date: 2026-04-15
Status: Approved design for implementation planning
Related docs:
- [Conversation Branching](../../features/conversation-branching.md)
- [Conversation Tree Design](./2026-04-11-conversation-tree-design.md)
- [Conversation Tree Map View](./2026-04-11-conversation-tree-map-view.md)

## Purpose

This document defines the approved design for replacing the current lightweight branch navigator with a true conversation map.

The goal is to make branching feel navigable at real scale. The current top-right branch navigator is useful only for local branch switching on the currently active path. It does not provide a meaningful overview of the conversation tree, and it is too small and indirect to serve as a primary navigation tool.

The approved direction is a structured split-pane map on desktop and a dedicated map surface on mobile.

## Product Position

The conversation map is:

- a navigation surface for the existing conversation tree
- a secondary surface alongside the transcript, not a replacement for the transcript
- a full-tree view, not an active-path-only outline
- a stable structured map, not a freeform canvas

The conversation map is not:

- a reuse of the existing inline thread panel
- a force-directed or Obsidian-style free graph
- a side-by-side branch comparison workspace
- a new persistence model for branches

## Core Outcome

When a conversation contains real branch points, the user can open a map that shows the full conversation tree in a stable top-to-bottom structure. The transcript remains the main reading and writing surface, while the map becomes the primary way to orient within large branching conversations.

The map must support:

- understanding the overall shape of the tree
- recognizing where the currently active path sits inside that tree
- navigating directly to any visible node, including nodes on non-active branches
- preserving layout stability so the map does not reshuffle when the user changes branches

## Surface Design

### Desktop

- The current top-right branch navigator is replaced by a small `Map` indicator button in roughly the same location.
- The button appears only when the conversation has at least one real branch point.
- Clicking `Map` opens a split view inside the main chat surface.
- The transcript remains on the left.
- The conversation map opens on the right.
- The split is resizable by drag.
- A sensible default split is approximately `65% transcript / 35% map`.
- The split must clamp to safe bounds so neither pane becomes unusable.
- Closing the map returns the transcript to full width.

Important boundary:

- The map does not occupy the existing `ThreadPanel` slot.
- The split happens inside the main chat area itself.

### Mobile

- Tapping `Map` opens a dedicated full-screen map surface.
- The map becomes a temporary takeover view with a clear back or close control.
- Selecting a node updates the active path and returns the user to the transcript at the selected location.
- The design should preserve the same mental model as desktop, but without attempting to squeeze transcript and map onto the screen at once.

## Interaction Model

### Opening and closing

- The map is closed by default.
- The user explicitly opens it by tapping the `Map` button.
- The map replaces the current branch navigator rather than layering on top of it.
- Reopening the map for the same conversation should restore the last map camera state for that conversation.

### Navigation

- Clicking any node in the map automatically activates the branch path that leads to that node.
- After path activation, the transcript scrolls to the selected node.
- The map is therefore a real navigation surface, not just a visualization.

### Hover and preview

- Hovering a node opens a small anchored preview tooltip after a short delay.
- The preview is intentionally lightweight, with enough text to recognize the message rather than read it in full.
- Hover preview does not change transcript state, branch state, or map selection.
- The preview disappears when hover leaves, but should not flicker aggressively.

### Follow mode

- The map runs in follow mode rather than hard sync.
- The active path is always visually highlighted.
- The node corresponding to the current visible transcript location receives a subtle but unmistakable current-location highlight.
- Manual pan and zoom temporarily relax follow behavior so the canvas does not fight the user.
- If the active transcript location moves far outside the current map viewport, the camera may gently shift to keep orientation.
- The map should never constantly re-center on every small scroll movement.

### Inline threads

- Opening an inline thread closes the map.
- This prevents the UI from turning into three competing surfaces.
- If the user later reopens the map, the conversation-specific map state should still be restored.

## Tree Layout Rules

### Direction and structure

- The map runs top-to-bottom because the transcript also reads top-to-bottom.
- The preserved `Main` continuation is the canonical center trunk.
- Alternate branches peel outward to the left and right from assistant fork points.
- The layout must be deterministic and stable.
- Switching branches must not cause the entire tree to reflow around the newly active branch.

### Stable trunk model

- The center lane always represents the canonical `Main` path.
- If the user is exploring a non-`Main` branch, that branch remains off-center.
- The active non-`Main` branch is emphasized through highlight treatment and camera bias, not through layout re-centering.
- This stability is required so the user can build spatial memory of the tree.

### Lane assignment

- Branch lanes are assigned in a stable, deterministic way.
- A branch keeps its side and relative lane position over time.
- New branches should occupy the nearest available outward lane from the fork point.
- The design should prefer compact, controlled horizontal growth over dramatic spreading.

## Node and Edge Design

### Node coverage

- Every top-level conversation message in the tree is represented as a node.
- The map is not limited to fork points only.
- This gives the user a true structural view of the conversation, not just a branch index.

### Role distinction

- User and assistant nodes are visually distinct.
- Assistant nodes are slightly more prominent than user nodes because branch structure is anchored on assistant replies.
- Distinction should come from color and shape, not from large wasted spacing.

### Labels

- Assistant nodes show a short clipped snippet by default.
- The snippet should be enough to orient without crowding the pane.
- User nodes should remain more compact and generally unlabeled by default unless zoomed in, hovered, or selected.
- The map should avoid feeling like a second transcript made of miniature chat bubbles.

### Active and current states

- The active path uses stronger line and node treatment than non-active branches.
- The current transcript position receives a subtle additional highlight, such as a soft halo, accent ring, or modest fill shift.
- Non-active branches remain visible but subdued.

### Density

- Vertical spacing should be compact.
- The map should feel like a dense tree rail rather than a list of large cards.
- User and assistant nodes should not be separated into large stacked rows.
- If needed, a slight horizontal role offset inside a lane may help readability without consuming much space.

## Zoom and Density Management

- The map supports pan and zoom.
- Zooming out should preserve overall structure rather than turning the pane into unreadable dust.
- Long uninterrupted linear stretches collapse into compact segments when zoomed out.
- Branch points remain explicit at all zoom levels.
- Zooming back in expands collapsed segments into individual message nodes.
- Collapse behavior is driven by zoom level rather than manual folding controls.

This keeps the map legible at both local and global scales without adding more UI chrome than necessary.

## Map State and Transcript State

### Data model

The map is a new projection of the existing conversation tree, not a new storage model.

The current branching model remains authoritative:

- `messages.previous_message_id` defines top-level tree structure
- `conversation_branches` defines branch metadata such as titles and preserved `Main`
- `selectedBranchIds` determines the currently active path

No database changes are required for the map concept itself.

### Conversation scope

The map should work for:

- persistent conversations
- local draft chats
- temporary chats

It should use the same branch model already used by the transcript path projection.

### Map camera state

- Camera position, zoom level, and other purely navigational map UI state should be tracked per conversation.
- This is client UI state, not branch persistence state.
- The design does not require saving map camera state to Supabase.

## Node Click Behavior

When the user clicks a node:

1. Determine the full branch route needed to reach that node from the root.
2. Update `selectedBranchIds` for every relevant fork along that route.
3. Clear any incompatible pending branch target.
4. Re-project the transcript to the newly active path.
5. Scroll the transcript to the selected node.
6. Update map highlighting to reflect the new active path and current location.

This is the most important behavior difference from the current implementation. Today the UI mostly switches one fork at a time. The map must be able to activate a full route through the tree in one action.

## Camera Framing

- When the map first opens, frame the currently active region rather than always framing the full tree.
- If the tree is small, a near-full-tree framing is acceptable.
- If the tree is very large, prioritize orientation around the active path.
- The user can zoom out to understand global shape or zoom in for local detail.

## Relationship To The Current Navigator

The current branch navigator should be retired as a shipped interaction pattern once the map is implemented.

Specifically, this design replaces:

- the small top-right branch count pill
- the floating outline overlay
- the active-path-only branch-point list

This design keeps:

- transcript-native branch chips under assistant replies
- active-path projection for the main transcript
- branch creation via `+ Branch`

The map augments transcript navigation; it does not remove local branch chips.

## Runtime Invariants

The map must not weaken existing branching guarantees.

These invariants remain unchanged:

- prompt assembly for top-level replies is based on the active path only
- sibling branches are never mixed into model context
- switching branches via the map is still just an update to active-path selection
- inline threads remain semantically separate from full-reply branches

The map may show the whole tree, but generation and runtime isolation still depend on the selected path only.

## Implementation Direction

### Architectural shape

The current transcript code already loads the full conversation tree but projects only one active path for rendering. The new map should reuse that loaded data and add a second projection plus layout layer.

High-level implementation direction:

- keep the existing active-path projection for the transcript
- add a full-tree map projection derived from all loaded messages and branch metadata
- add a structured layout pass that assigns stable vertical ordering and horizontal lanes
- replace the current `BranchNavigator` overlay with a small `Map` toggle plus dedicated map surface components
- extend branch selection logic so a single node click can activate every fork needed along a route

### Likely file impact

- `frontend/app/home/page.tsx`
  - replace current navigator orchestration with map-open state, split-surface layout, conversation-scoped map UI state, and route-based node navigation
- `frontend/app/home/components/conversationTree.ts`
  - retain active-path helpers, add route derivation and possibly shared tree indexing helpers
- `frontend/app/home/components/BranchNavigator.tsx`
  - remove or replace with a much smaller toggle-only control
- new map-focused components/helpers
  - map pane
  - mobile map surface
  - layout engine
  - hover preview
  - lane and camera utilities

### Layout boundary

- The map is part of the main conversation workspace.
- It should not be implemented as a reuse of `ThreadPanel`.
- The existing inline thread workflow remains independent and should close the map when activated.

## Risks And Guardrails

### Visual noise

Risk:

- a full-node tree becomes unreadable in a narrow pane

Guardrails:

- compact spacing
- assistant-first labeling
- zoom-based collapse for long linear stretches
- subdued non-active branches
- lightweight hover preview rather than always-visible large cards

### Spatial instability

Risk:

- users lose spatial memory if the tree moves around when branch selection changes

Guardrails:

- fixed `Main` trunk in center
- stable deterministic lane assignment
- active-path highlighting instead of re-layout

### Interaction conflict

Risk:

- follow mode fights manual exploration

Guardrails:

- follow mode is gentle, not hard sync
- manual pan/zoom temporarily relaxes camera follow
- large active-path displacement can trigger a modest corrective shift

### Scope drift

Risk:

- the map grows into a canvas tool or a second transcript renderer

Guardrails:

- map remains navigation-first
- transcript remains the primary reading and writing surface
- preview cards stay lightweight
- branch chips in the transcript remain the local switching control

## Testing Focus

Implementation planning should include coverage for:

- opening and closing the map on desktop and mobile
- resizable split behavior on desktop
- stable lane placement across branch switching
- map click correctly updating all branch selections needed for a target node
- transcript scroll jumping to the selected node
- current-location highlight following transcript position
- manual pan/zoom not being overridden too aggressively by follow mode
- zoom-based collapse preserving branch visibility
- inline thread open closing the map
- temporary, draft, and persistent chat compatibility
- active-path prompt isolation remaining unchanged after map-driven navigation

## Summary

The approved design replaces the current lightweight branch navigator with a real conversation map:

- desktop uses a resizable split workspace with transcript left and map right
- mobile uses a full takeover map surface
- the map shows the full tree with every message as a node
- `Main` remains the stable center trunk
- side branches peel left and right in deterministic lanes
- assistant nodes carry short labels
- hover reveals lightweight previews
- clicking any node activates that route and jumps the transcript there
- the runtime branch model and active-path isolation stay unchanged

This design intentionally upgrades branching from a local branch-switching affordance into a serious navigation tool for dense conversation trees.

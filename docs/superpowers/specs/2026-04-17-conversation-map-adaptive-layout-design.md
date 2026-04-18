# Conversation Map Adaptive Layout Design

Date: 2026-04-17
Status: Approved design for implementation planning
Related docs:
- [Conversation Map UI Refresh Design](./2026-04-17-conversation-map-ui-refresh-design.md)
- [Conversation Branching](../../features/conversation-branching.md)
- [Keen Design Language](../../design/design-language.md)

## Purpose

This document defines the approved layout redesign for the conversation map tree.

The map renderer now uses readable merged turn cards, but the underlying spatial layout is still too rigid. It relies on fixed lane numbers and fixed horizontal gaps, which causes deeper branch growth to collide or feel artificially constrained.

The approved direction is to replace the rigid lane layout with an adaptive, subtree-aware tree layout that:

- preserves a clear top-to-bottom reading order
- keeps the current route as the visual spine
- distributes branches symmetrically around that spine
- lets nearby subtrees slide outward when new structure appears
- avoids a fully force-directed graph feel

## Problem Statement

The current layout has several concrete failures:

- horizontal position is derived from a single integer lane instead of actual subtree width
- branch growth does not reserve space for descendants
- sibling subtrees can end up reusing the same lane and overlapping at the same depth
- the tree does not breathe when a deep branch is added
- rigid right-angle connectors amplify the sense of diagrammatic stiffness
- the current model values lane stability more than actual readability

## Core Outcome

The conversation map should feel spatially coherent without feeling rigid.

When the tree gains more branches:

- new subtrees should create space around themselves
- nearby branches should slide outward rather than collide
- the active route should remain visually centered
- left and right branch weight should feel balanced
- the whole map should remain deterministic and readable enough for navigation

## Non-Goals

This redesign does not introduce:

- a freeform force-directed graph
- physics-driven jitter or continuous live simulation
- changes to branching persistence or routing semantics
- arbitrary manual node dragging
- a horizontally mirrored comparison mode

## Approved Direction

The approved direction is a **layered constraint layout**.

The map keeps:

- depth-based vertical ordering
- deterministic layout output for the same tree structure
- the current route as the visual spine
- a tree-first mental model instead of a graph toy

The map changes:

- lane integers stop being the primary layout primitive
- subtree width is measured explicitly
- horizontal positions are assigned from subtree envelopes
- a local horizontal relaxation pass resolves crowding and creates breathing room
- connectors become softly diagonal or shallow bezier paths rather than strict right angles

## Layout Principles

### 1. Depth stays fixed

Vertical position remains tied to conversation depth.

That means:

- the user can still read the map top-to-bottom
- transcript order remains intuitive
- navigation orientation does not depend on a moving vertical axis

### 2. The current route defines the spine

The active or main route is the visual centerline of the tree.

The spine should:

- remain the calmest path through the map
- stay closest to the center of the subtree composition
- use the straightest or least-angled connectors
- remain visually legible even when side branches expand

### 3. Branch mass distributes symmetrically

Sibling branches should be balanced around the spine rather than weighted to one side.

That means:

- child subtrees are packed around the parent center
- wider subtrees reserve more space than narrower ones
- left and right spread should feel compositionally balanced
- the map should not drift into a one-sided stack of alternates

### 4. Reflow is local, not global

When a new branch is created or a subtree grows:

- nearby subtrees may slide outward to make room
- movement is strongest near the changed fork
- distant parts of the tree should remain mostly stable

Navigation between existing branches should not trigger a broad relayout. Structural changes can reflow the tree; route selection alone should mostly preserve positions.

## Node Positioning Model

The layout uses a three-pass horizontal algorithm.

### Pass 1: Measure subtree envelopes

Walk bottom-up from leaves to root.

For each node, compute:

- `selfWidth`
  - card width plus minimum horizontal gutter
- `childEnvelopes`
  - the required footprint of each child subtree
- `subtreeWidth`
  - the total width required to place all child subtrees without overlap
- `centerBias`
  - which child should remain closest to the spine

Bias order:

1. current-route child
2. main branch child
3. default ordered child

Leaves use their own card width as their subtree width.

### Pass 2: Assign ideal x positions

Walk top-down from the root.

For each node:

- assign the node center x position
- divide its subtree envelope into child slots
- place the center-biased child closest to the parent center
- distribute remaining children alternately left and right in a balanced spread
- allow wider child subtrees to claim more width than smaller ones

This creates a stable ideal layout before any collision resolution.

### Pass 3: Relaxation pass

Run a deterministic horizontal relaxation pass over the positioned tree.

The pass should:

- push overlapping or too-close nodes apart within each depth layer
- keep pushes symmetric where possible
- apply a soft pull back toward each node's ideal x
- apply a soft parent-child centering pull
- keep the current spine slightly stiffer than side branches

This is not a continuously running physics simulation. It is a small deterministic constraint pass that adds elasticity without jitter.

## Connector Design

Connectors should reflect the adaptive layout.

Approved connector behavior:

- short vertical exit from the lower part of the parent card
- then a gentle diagonal or shallow bezier toward the child
- calmer, straighter connectors on the current spine
- looser outward angle for side branches

Avoid:

- long Manhattan elbows
- stacked right-angle turns
- decorative graph flourishes that compete with the cards

## Stability Rules

### Structural changes

If the tree topology changes, the layout may reflow.

Examples:

- a new branch is created
- a branch grows deeper
- a pending turn becomes a real branch point

In these cases, local outward sliding is expected and desired.

### Navigation changes

If the user only switches between existing branches:

- the map should not fully relayout
- current-path styling may change
- camera recentering may change
- node positions should remain largely stable

### Resize and zoom

Pane resizing and zooming should not change the underlying layout solution.

They affect:

- viewport
- camera
- scale

They should not trigger a new structural arrangement of the tree.

## Motion Rules

Motion should communicate reflow without looking animated for its own sake.

Approved behavior:

- compute target positions deterministically
- animate cards and connectors into place with a short eased or spring-like transition
- keep motion short and local
- avoid ongoing drift or oscillation

The tree should feel like it flexes into place, not like it is being simulated in real time.

## Data Model Impact

The layout model should stop treating `lane` as the primary source of horizontal truth.

Implementation may:

- replace `lane` with computed `x`
- keep `lane` only as an ordering hint
- add `idealX`, `resolvedX`, subtree width, or sibling-order metadata

Required invariants:

- route-selection helpers remain pure and deterministic
- message-to-node identity remains stable
- rendered nodes still represent merged prompt/response turn cards
- desktop and mobile renderers both consume the same layout output

## Testing Requirements

The implementation must add or update coverage for:

- subtree layouts that would previously overlap under fixed-lane assignment
- symmetric placement around the current spine
- local outward reflow when new branches are introduced
- stable positions when only the active route changes
- non-overlap guarantees at each depth layer
- connector rendering assumptions where browser coverage is practical

## Success Criteria

The adaptive layout is successful when:

- no two rendered cards overlap in normal tree states
- deeper branches push outward instead of colliding
- the current route still reads as the visual center spine
- branch spread feels balanced left/right
- the tree remains understandable while panning and zooming
- the layout feels more organic than the current lane grid without becoming graph-like or chaotic


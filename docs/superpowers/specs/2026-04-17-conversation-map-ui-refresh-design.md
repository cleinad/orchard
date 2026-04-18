# Conversation Map UI Refresh Design

Date: 2026-04-17
Status: Approved design for implementation planning
Related docs:
- [Conversation Branching](../../features/conversation-branching.md)
- [Conversation Map Split-Pane Design](./2026-04-15-conversation-map-split-pane-design.md)
- [Keen Design Language](../../design/design-language.md)

## Purpose

This document defines the approved UI redesign for the conversation map.

The current map logic is broadly correct, but the shipped rendering is not. The existing surface feels too miniature, too bubbly, too label-heavy, and too disconnected from Keen's editorial design language. It makes the tree hard to read even when the underlying branch navigation works.

The approved direction is to keep the map as a spatial tree on a resizable canvas while overhauling the rendering and interaction model around readable merged turn cards.

This is intentionally a UI reset. Implementation may heavily refactor or fully replace the current `ConversationMap.tsx` renderer as long as existing branch behavior and route activation rules are preserved.

## Problem Statement

The current map has several concrete problems:

- user prompt and assistant response are split into separate tiny nodes even though they function as one turn in practice
- node previews are too short to orient the user
- the one-line oval treatment is visually weak and wastes the little space it uses
- the bottom preview strip is detached from the node being inspected
- click-to-transcript navigation feels inconsistent
- branch titles add more noise than clarity
- map chrome uses full caps and other styling that fights the Keen design language
- the surface feels like a widget instead of a serious reading and navigation tool

## Core Outcome

The map should feel like a calm research surface for navigating branched conversations.

When the user opens the map:

- the tree remains spatial and resizable
- each visible node is readable enough to orient from the canvas alone
- hovering a node reveals a richer local preview beside that node
- clicking a node reliably activates the correct route and opens the corresponding place in the transcript
- the map and thread panel never compete for space or attention

## Non-Goals

This redesign does not introduce:

- a new persistence model
- visible branch titles in the map UI
- side-by-side transcript comparison
- a second inspector dock at the bottom of the map
- a freeform force-directed graph

## Approved Direction

The approved direction is **editorial note cards on a spatial tree**.

The map keeps:

- split-pane desktop behavior
- full-screen mobile takeover behavior
- pan and zoom
- stable deterministic tree layout
- route activation from any node

The map changes:

- separate user and assistant nodes become one merged turn card
- tiny ovals are replaced with restrained landscape cards
- the bottom preview dock is removed
- hover preview moves to a floating tooltip beside the node
- visible branch titles are removed
- all-caps micro-labeling is removed

## Surface Design

### Desktop

- The map remains a right-side pane in the main chat surface.
- The pane remains horizontally resizable.
- The canvas should continue to feel like an Obsidian-style navigable area in the sense that resizing changes how much of the tree is comfortably visible.
- Default sizing should still favor the transcript, but the map must remain useful at medium widths rather than only after extreme expansion.
- The header chrome should be simplified so the tree becomes the dominant visual idea.

### Mobile

- The map remains a full-screen takeover.
- The same node language should be used on mobile, adjusted for viewport width.
- The design should not depend on hover for comprehension.
- Selecting a node still returns the user to the transcript at the chosen location.

## Visual Language

The conversation map should align with Keen's quiet editorial research UI.

Required tone:

- calm
- precise
- readable
- low-chrome
- content-led

Avoid:

- bubbles
- pills
- glossy effects
- strong glows
- dense badge stacks
- dashboard-like chrome

Approved styling direction:

- soft `blizzard`-tinted or paper-like fill
- crisp thin borders
- restrained corner radius
- light active wash instead of halo-heavy emphasis
- hierarchy through typography, spacing, and contrast rather than decoration

## Node Model

### Merged turn card

Each map node represents a merged top-level turn:

- the user prompt
- the assistant response that follows it

This replaces the current separate user/assistant node pairing in the visual layer.

The underlying tree logic can still derive from individual messages, but the rendered unit is the turn card.

Important implication:

- the map should never show a user turn floating on its own without the assistant continuation preview that makes that turn meaningful

### Shape and proportions

- Node shape is a restrained landscape card, not an oval
- Target proportion is approximately `3:2`
- Desktop target size is roughly `300-336px` wide by `188-216px` tall
- Exact dimensions may adapt slightly with pane width, but nodes must not collapse back into miniature capsules
- Corners should remain restrained, around `10px-12px`, not pill-like

### Content hierarchy

At rest, each node shows:

- a single-line prompt excerpt at the top
- a dominant assistant response excerpt in the main body
- minimal state treatment only when useful

Prompt rules:

- always visible
- single truncated line
- muted but readable

Assistant excerpt rules:

- primary content of the node
- readable at default zoom
- usually `2-3` lines on desktop
- should carry more visual weight than the prompt line

State rules:

- no visible branch titles
- no repeated `Prompt` / `Assistant` labels in every node
- no oversized metadata blocks
- current-route or current-turn state may appear in a very small footer or via border/fill treatment

## Tree Layout

The map remains a stable spatial tree, not a list.

Layout rules:

- top-to-bottom reading direction remains
- deterministic lane assignment remains
- active path must remain spatially understandable without relayout
- lanes should stay compact enough that medium-width panes still hold meaningful context
- branch spread should be more controlled than in the current map

Connector rules:

- connectors should feel quieter, straighter, and more architectural than the current decorative curves
- the active path gets stronger contrast and weight
- fork junctions should be easier to parse at a glance
- connector attachment should support the wider card form factor rather than centering everything around tiny pills

## Interaction Model

### Node click behavior

Clicking a node must always:

1. activate the full route needed to reach that turn
2. update map selection state immediately so the click feels deterministic
3. open the corresponding location in the transcript on the left
4. scroll that transcript location into view even if the clicked node is already on the current route

If the rendered node represents a merged turn:

- transcript anchoring should prefer the user prompt when that produces more stable visible context
- the assistant response remains the semantic content preview for the node

### Hover and focus preview

- The bottom preview strip is removed entirely.
- Hovering a node opens a floating tooltip next to that node.
- The tooltip disappears as soon as pointer leaves the node.
- The tooltip should not linger independently.
- Keyboard focus should reveal the same richer preview behavior.
- Pointer hover and keyboard focus use the same content model, but their lifetimes follow their own state:
  - pointer leave closes the hover tooltip immediately
  - focus blur closes the focus preview
- The tooltip is not itself a persistent hoverable surface.

Tooltip content:

- fuller prompt excerpt
- longer assistant response excerpt

Tooltip constraints:

- large enough to be meaningfully more informative than the default node
- not so large that it becomes a second panel
- should avoid covering the hovered node when possible
- should visually feel like an attached reading note rather than a detached inspector

### Hover state boundaries

- hovered state and selected/current state must be distinct
- a node should not look selected merely because the cursor passed over it
- tooltip behavior should not interfere with panning the empty canvas

### Mobile and touch

- The design must not rely on hover for essential comprehension.
- Mobile nodes should remain readable enough by default to support selection.
- Mobile does not need a detached tooltip equivalent.
- Selecting a node on mobile still performs route activation and closes the takeover surface back to the transcript.

## Map and Thread Panel Exclusivity

The map and thread panel are mutually exclusive surfaces.

Rules:

- opening the thread panel closes the map
- opening the map closes the thread panel
- this should be implemented as a deliberate shared rule, not as incidental cleanup
- the user should never see both surfaces competing at once

## Header and Chrome Cleanup

The panel should be visually quieter than the current implementation.

Approved direction:

- reduce ornamental background treatment
- reduce unnecessary labels
- remove all-caps microcopy
- keep the close control and any small map metadata, but do not let header chrome dominate the pane

The main visual focus should be:

- the tree
- the cards
- the active route

not the panel frame.

## Branch Titles

Visible branch titles are removed from the map UI.

Reasoning:

- titles like `Main` add little value in the spatial tree
- auto-derived titles often create noise instead of orientation
- the tree should read through prompt + response content and connector structure, not abstract naming

Branch metadata may still exist internally for:

- route calculation
- accessibility
- future non-visual uses

But the shipped map UI should not surface branch titles as node chrome.

## Copy and Typography Rules

No all caps should appear in this surface.

That includes:

- headers
- metadata
- state labels
- navigation chrome

Hierarchy should come from:

- size
- weight
- spacing
- contrast

Typography direction:

- compact UI chrome may use `font-sans`
- reading excerpts should use the existing reading voice
- prompt line should be quieter than the assistant preview

This redesign also requires a design language update in `docs/design/design-language.md` to formalize a repo-wide rule against full-caps product UI.

## Accessibility

The redesigned map must improve accessibility over the current SVG-centric interaction.

Requirements:

- interactive nodes must expose clear focus behavior
- keyboard users must be able to move through nodes in a predictable order
- hovered preview behavior must have a focus equivalent
- text contrast must remain strong in light surfaces
- visual hierarchy must not rely on color alone

## Testing Implications

Existing map behavior should remain covered:

- desktop split pane opens and resizes
- mobile map opens as a takeover and returns to transcript after navigation
- selecting a node activates the correct route and transcript location
- opening inline thread UI closes the map

Additional coverage should be added or updated for:

- merged turn node rendering instead of separate user/assistant pills
- node click consistency for already-active routes
- hover/focus preview behavior and disappearance on leave
- mutual exclusivity between map and thread panel as an explicit invariant
- absence of visible branch titles in the rendered map

Testing should prefer stable structural selectors rather than brittle visual text assumptions where possible.

## Implementation Latitude

This design does not require preserving the current renderer architecture.

Approved implementation latitude:

- refactor the current component heavily
- replace the SVG node rendering model
- rewrite the surface from scratch if that is cleaner

As long as the shipped behavior preserves:

- branch route activation rules
- desktop/mobile surface behavior
- transcript synchronization
- mutual exclusivity with thread UI

## Summary of Approved Decisions

- keep the tree map concept
- keep the resizable canvas
- merge prompt and response into one rendered node
- use restrained `3:2` landscape cards
- keep prompt always visible
- remove visible branch titles
- remove all-caps UI from the map
- replace the bottom preview strip with a node-adjacent tooltip
- hide the tooltip immediately when pointer leaves the node
- treat map and thread panel as mutually exclusive surfaces
- allow a full renderer rewrite rather than incremental polish

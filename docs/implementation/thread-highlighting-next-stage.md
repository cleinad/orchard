# Thread Highlighting Next Stage

## Purpose

This note defines the next implementation direction after the initial markdown thread highlighting revamp.

The initial revamp added GFM table rendering, a structured selectable text stream, stream-version persistence, CSS Highlight API-based persisted highlights, v2-only runtime anchoring, and table-safe marker rendering. That moved the system in the right direction, especially for code blocks and table rendering.

The remaining work is the broader fragmented-highlight problem: CSS Highlight API is not enough by itself for consistently seamless visuals across KaTeX, tables, code, and complex inline layout.

This spec is intended to be used as an implementation goal.

## Implementation Status

The earlier v2 stream, table-safe DOM, click-target, and table-selection work has been implemented.

The custom rect overlay described here is now implemented as the primary visual highlight path for active and persisted thread highlights. Inline thread spans remain as click and keyboard targets, but their backgrounds are demoted when overlay geometry is available. CSS Highlight API painting is no longer the primary runtime path.

## Intended Outcome

Thread highlights should feel stable, smooth, and boringly correct.

Users should be able to highlight text inside paragraphs, lists, code blocks, math, and tables without the rendered message changing shape. Persisted highlights should reopen threads reliably, and the visual highlight should not depend on whether the underlying renderer split content into many spans, table nodes, or KaTeX layout boxes.

The most important visible upgrade is math. A selected math expression should read as one intentional highlight surface, not as scattered chips around individual KaTeX spans. Inline math should feel as smooth as normal text. Display math should preserve the shape of fractions, superscripts, subscripts, operators, and wrapped formulas while reducing tiny gaps and speckling. Subexpression selections, such as a numerator term or a few variables inside a larger formula, should remain possible and should look cleanly selected without forcing the whole formula to become atomic.

Tables in particular must remain structurally stable while the next visual layer improves smoothness.

## Core Visual Principle

The underlying rendered DOM is allowed to stay fragmented.

Markdown, syntax highlighting, tables, and KaTeX all produce complex DOM for good reasons. Trying to force those renderers into one continuous wrapper would either break semantics, distort layout, or lose useful subexpression selection.

The goal is not to make the DOM unfragmented. The goal is to layer a smoother, app-controlled highlight surface above the fragmented DOM.

That means:

- canonical offsets remain the source of truth
- restored DOM ranges remain the bridge from text model to layout
- inline spans remain click targets and fallback markers
- the primary visual highlight becomes an overlay made from measured range geometry
- smoothing happens in the overlay merge rules, not by rewriting renderer output

## Implemented Direction: Solve Fragmentation With A Custom Rect Overlay

Best recommended path: build a custom highlight overlay based on `Range.getClientRects()`.

CSS Highlight API is a useful improvement, but it still delegates painting to browser text/highlight internals. That means complex content can remain visually fragmented:

- KaTeX math is made of many positioned/nested elements.
- Tables have cells, borders, spacing, and structural boundaries.
- Syntax highlighting creates many inline spans.
- Multi-line selections produce many rects with tiny gaps.

A custom rect overlay gives the app control over the final visual shape.

Recommended overlay design:

1. Restore one or more DOM ranges from canonical offsets.
2. Read `range.getClientRects()` for each range.
3. Convert rects into coordinates relative to the message content root.
4. Merge nearby rects on the same visual line.
5. Clip or group rects by table cell when inside tables.
6. Render absolutely positioned highlight rectangles behind text but above the message background.
7. Keep click targets separate from the overlay.

The overlay should support:

- active selection highlight
- persisted thread highlights
- hover/focus emphasis for one thread
- table cell and row selections
- code block multi-line selections
- KaTeX subexpression selections

Rect merging rules:

- Merge rects on the same line when their vertical overlap is high and horizontal gap is below a small threshold.
- Do not merge across table cell borders unless intentionally rendering a row-level band.
- Preserve separate rects for wrapped lines.
- Ignore near-zero rects.
- Round coordinates to avoid subpixel shimmer.

Recommended table behavior:

- For text selected inside cells, draw rects inside each cell's content area.
- For full-cell or full-row selections, optionally draw a soft cell background band behind the text rects.
- Do not draw one giant rectangle across table gutters unless it looks intentional.

Recommended math behavior:

- Prefer rect overlays over marker-span backgrounds.
- Use KaTeX visible HTML only; hidden MathML stays excluded.
- Merge tiny adjacent rects more aggressively inside `.katex-html` to reduce fragmented speckling.
- Keep subexpression selection support rather than making entire formulas atomic.

Why this is the best option:

- It handles code, math, and tables with one visual model.
- It avoids invalid DOM wrappers.
- It gives us control over smoothing and merging.
- It keeps canonical offsets as the source of truth.
- It can replace both CSS Highlight API visuals and span-background visuals over time.

CSS Highlight API was useful as a short-term baseline, but the overlay is now the primary path for the "seamless, unbroken blocks" target.

## Recommended Phased Approach

### Phase 1: Overlay Infrastructure

Build a `ThreadHighlightOverlay` layer inside each message content root. Implemented in [ThreadHighlightOverlay.tsx](../../frontend/app/home/components/ThreadHighlightOverlay.tsx).

Responsibilities:

- accept restored `Range` objects for active and persisted thread highlights
- read `range.getClientRects()`
- convert viewport rects to coordinates relative to `[data-message-content]`
- render absolutely positioned highlight rectangles behind text
- update on resize, scroll, message content changes, and thread hover/focus state
- avoid changing markdown, table, code, or KaTeX DOM structure

This phase now restores ranges from offsets, measures rect geometry, excludes overlay DOM from the canonical selectable stream, and remeasures on resize, scroll, and font settling.

### Phase 2: Persisted Highlight Overlay

Move persisted thread visuals onto the overlay first. Implemented.

Keep existing inline thread spans for click targets. When the overlay is active, marker spans should remain visually quiet, as they do today with range highlights.

Why persisted first:

- persisted highlights are already reconstructed from offsets
- they expose the math/code fragmentation problem clearly
- they do not need to track the browser's live selection in real time
- fallback behavior remains straightforward if overlay measurement fails

### Phase 3: Generic Rect Merging

Add renderer-agnostic merge rules. Implemented baseline rules:

- discard zero-size or near-zero rects
- round coordinates to reduce subpixel shimmer
- group rects by visual line using vertical overlap
- merge same-line rects when horizontal gaps are below a small threshold
- preserve separate rectangles across wrapped lines
- recompute when fonts/layout settle

This should improve normal paragraphs, inline code, code blocks, and many simple math cases before adding renderer-specific tuning.

### Phase 4: KaTeX-Specific Smoothing

Tune overlay behavior inside `.katex-html`. Implemented baseline smoothing:

Recommended rules:

- use only visible KaTeX HTML rects; hidden MathML remains excluded
- merge tiny adjacent rects more aggressively than normal text
- tolerate small vertical deltas caused by superscripts, subscripts, and fraction layout
- avoid creating a single full-formula blob for small subexpression selections
- preserve subexpression selection for cases like numerator pieces, variables, and inline terms

The desired outcome is that the selected math expression reads as one intentional highlight surface even though the underlying KaTeX DOM may contain many small spans.

### Phase 5: Table And Code Refinement

Extend the same overlay model to complex non-math regions. Implemented baseline support:

- clip or group table rects by cell so highlights do not bleed across borders unintentionally
- optionally render a soft full-cell/full-row band when a selection covers most of a cell or row
- merge code-block rects across syntax token spans while preserving line breaks
- avoid covering code-block chrome, copy buttons, or excluded selection regions

This phase should preserve all table-safe DOM work from the previous revamp. The overlay improves paint only; it must not introduce table wrappers or layout changes.

### Phase 6: Active Highlight Overlay

Move active selection/pending-thread highlights onto the same overlay path. Implemented.

This makes active and persisted highlights visually consistent. It also avoids having three visual systems competing with each other:

- browser native selection
- CSS Highlight API
- persisted span backgrounds

The browser's native selection can still appear during the immediate drag gesture, but once the app captures offsets, the app-owned overlay should become the stable visual state.

### Phase 7: Fallback And Cleanup

Keep fallbacks but demote them. Current state:

- CSS Highlight API is no longer the active/persisted visual path
- marker span backgrounds remain a final fallback for unsupported browsers or failed measurements
- click targets remain separate from visual geometry
- diagnostics should log when a stored range cannot be restored or measured

Tests now assert overlay geometry and smoothness expectations instead of accepting fragmented span backgrounds as normal.

## Success Criteria

- Math highlights look visibly smoother than the current CSS Highlight API version.
- Code highlights render as smooth merged bands across syntax tokens and wrapped lines.
- Table highlights remain structurally stable while overlay rects respect cell boundaries.
- Thread click/reopen behavior works from table, code, and math selections.
- Active and persisted highlights use the same overlay visual model.

## Non-Goals

- Do not make math formulas atomic unless subexpression selection becomes impossible to support.
- Do not rely on inline marker backgrounds as the final visual solution.
- Do not insert wrapper elements into invalid table positions.

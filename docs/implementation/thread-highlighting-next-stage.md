# Thread Highlighting Next Stage

## Purpose

This note defines the next implementation direction after the initial markdown thread highlighting revamp.

The initial revamp added GFM table rendering, a structured selectable text stream, stream-version persistence, CSS Highlight API-based persisted highlights, v2-only runtime anchoring, and table-safe marker rendering. That moved the system in the right direction, especially for code blocks and table rendering.

The remaining work is the broader fragmented-highlight problem: CSS Highlight API is not enough by itself for consistently seamless visuals across KaTeX, tables, code, and complex inline layout.

This spec is intended to be used as an implementation goal.

## Implementation Status

The earlier v2 stream, table-safe DOM, click-target, and table-selection work has been implemented. This document now tracks the remaining custom rect overlay work.

## Intended Outcome

Thread highlights should feel stable, smooth, and boringly correct.

Users should be able to highlight text inside paragraphs, lists, code blocks, math, and tables without the rendered message changing shape. Persisted highlights should reopen threads reliably, and the visual highlight should not depend on whether the underlying renderer split content into many spans, table nodes, or KaTeX layout boxes.

Tables in particular must remain structurally stable while the next visual layer improves smoothness.

## Remaining Step: Solve Fragmentation With A Custom Rect Overlay

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

CSS Highlight API can remain as a short-term fallback or simpler baseline, but the overlay should become the primary path for the "seamless, unbroken blocks" target.

## Recommended Work Sequence

1. Build the custom rect overlay behind a feature boundary.
2. Move active and persisted highlights onto the overlay.
3. Tune rect merging for code, tables, and KaTeX.
4. Keep CSS Highlight API/span backgrounds only as fallback.

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

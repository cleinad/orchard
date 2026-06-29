# Inline Thread Rendering

## What This Doc Covers

This doc explains how inline-thread anchoring works in the home chat UI.

It is a maintainer note for future changes to chat display and markdown rendering. It focuses on how a source selection becomes:

- an active highlight
- persisted thread metadata
- a durable clickable inline thread marker after reload or panel close

This is not a product-behavior doc. See [inline-threads.md](../features/inline-threads.md) for that.

## Core Invariant

Inline-thread positions are anchored by text offsets relative to a versioned selectable text stream for the rendered message content root.

That root is the element marked with `data-message-content` in [ConversationView.tsx](../../frontend/app/home/components/ConversationView.tsx). Offsets are not measured against the outer message row, and they are not derived later by searching `highlightedText`.

This invariant matters because the visible chat row also contains labels, timestamps, and other chrome that must not affect thread placement.

Thread anchors use the `markdown-structure-v2` stream. The stored stream-version column remains for future migrations, but the dev-stage runtime normalizes missing, legacy, or unknown values to v2.

## Why Substring Matching Was Removed

The earlier durable-link model stored `highlightedText` and then tried to reattach a thread by finding that substring in the rendered message.

That broke on a broader class of cases:

- ordered-list markers such as `3.`
- bullet-list prefixes
- repeated text where the same phrase appears multiple times
- selections that cross markdown/render boundaries
- whitespace differences between browser selection text and rendered text nodes

The active highlight was already offset-based, so the old design used two different locator models:

- active selection: offsets
- durable inline link after close/reload: substring search

The current implementation removes that split. Active and durable linkage now share the same offset-based locator.

## End-To-End Lifecycle

### 1. Selection capture

[useHomeThreads.ts](../../frontend/app/home/components/useHomeThreads.ts) resolves the browser selection after `pointerup` settles.

The hook:

- limits selection handling to assistant messages
- finds the nearest `[data-message-content]` root
- calculates `startOffset` and `endOffset` through the shared selectable-text index for that content root and stream version
- stores the active selection for popover placement and highlight reconstruction

The browser’s native selection is preserved so normal copy remains available. The app also keeps the active source offsets in state so the overlay can keep the source visible when focus moves.

### 2. Active highlight reconstruction

While a popover or derived thread is active, the same hook rebuilds a DOM `Range` from `startOffset` and `endOffset` when it needs to preserve the native selection for copy behavior.

The visible active highlight is rendered by `ThreadHighlightOverlay` inside the matching message row. The overlay receives the active source offsets, restores the range inside `[data-message-content]`, measures `Range.getClientRects()`, merges nearby rects, and paints an app-owned highlight surface.

### 3. Persistence

When a real persistent thread is created, [route.ts](../../frontend/app/api/chat/route.ts) requires valid `startOffset` and `endOffset` values.

Those values are written to `public.threads` as:

- `start_offset`
- `end_offset`
- `selection_stream_version`

`highlightedText` is still stored, but it is metadata, not the durable anchor.

### 4. Reload into client thread metadata

[useHomeData.ts](../../frontend/app/home/components/useHomeData.ts) loads:

- `id`
- `source_message_id`
- `highlighted_text`
- `start_offset`
- `end_offset`

It converts those rows into `ThreadMeta` objects used by the message renderer.

During the current dev-stage revamp, loaded rows are normalized onto `markdown-structure-v2`. Old local anchors may be discarded or regenerated rather than preserving a second render-time path.

### 5. Durable rendering in markdown

[MarkdownWithThreads.tsx](../../frontend/app/home/components/MarkdownWithThreads.tsx) is the durable inline-thread renderer.

It no longer searches for `highlightedText`.

Instead it:

- normalizes the message’s thread ranges into non-overlapping offset matches
- adds a rehype transform to the markdown pipeline
- walks the rendered HAST tree using the same selectable text-stream boundary rules used for capture and highlight restoration
- splits text nodes wherever a thread’s `[startOffset, endOffset)` range intersects
- wraps valid inline text spans in marker nodes carrying `data-inline-thread-id`

At render time, those marker spans become clickable `ThreadIndicator` elements.

Persisted visual highlighting no longer depends on those marker spans as the primary background. Message rows pass persisted thread offsets to `ThreadHighlightOverlay`, which restores DOM ranges and paints measured rect overlays for text, code, math, and table selections. The spans remain the click/focus target; the smoother overlay carries the main visual treatment.

### 6. Tables and structural boundaries

GFM table rendering is enabled. In `markdown-structure-v2`, structural boundaries are part of the canonical selectable stream:

- tabs between table cells
- newlines between table rows
- newlines between adjacent block/list regions

Formatter-only whitespace text nodes emitted between block elements are ignored before those virtual boundaries are added. This keeps paragraph-to-table selections at one canonical newline instead of counting both renderer whitespace and the app's structural separator.

This makes table selections behave like spreadsheet copy/paste while keeping prompt context, copy text, active highlights, and persisted highlights aligned.

Those tabs and newlines are stream-only values. The markdown renderer must never insert marker spans directly under `table`, `thead`, `tbody`, `tfoot`, `tr`, `colgroup`, or `col`. When a selection crosses table structure, each selected cell receives its own valid cell-local marker fragment.

## Wrapping Rules

The renderer intentionally skips inline-thread wrapping inside non-selectable or unsafe regions.

Today it skips:

- `math`
- `annotation`
- direct text nodes under table structure, where marker spans would create invalid HTML
- nodes explicitly marked with `data-selection-exclude`, such as code-block chrome and hidden KaTeX MathML

Code text and visible KaTeX HTML are threadable. Hidden renderer fallbacks stay out of the selectable text stream so offsets, active highlights, copy text, and durable markers agree.

## What Future Chat-Display Changes Can Break

Any change that alters the rendered text stream inside `[data-message-content]` can change offset semantics.

High-risk changes include:

- changing markdown remark or rehype plugins
- changing selectable stream boundary rules
- inserting new visible text inside the content root before existing message text
- changing how lists, math, or code are rendered
- changing how tables are rendered
- wrapping or splitting text nodes in a way that changes the rendered text order
- moving visible prefixes from CSS semantics into actual text nodes, or the reverse

Lower-risk changes include:

- styling changes outside `[data-message-content]`
- labels or timestamps outside the content root
- panel/popover layout changes that do not affect message content rendering

## If You Need To Change Chat Display

When modifying chat rendering, preserve these rules:

- keep offsets relative to `[data-message-content]`
- keep active highlight reconstruction and durable inline rendering on the same offset model
- treat `highlightedText` as metadata, not as the source of truth for placement
- update the renderer and selection code together if the text stream changes

If the message content root changes, update both:

- selection capture and restore in [useHomeThreads.ts](../../frontend/app/home/components/useHomeThreads.ts)
- durable wrapping in [MarkdownWithThreads.tsx](../../frontend/app/home/components/MarkdownWithThreads.tsx)

## Tests To Run After Renderer Changes

Run the Chromium inline-thread Playwright suite described in [inline-threads-e2e.md](../testing/inline-threads-e2e.md).

The current high-value regressions are:

- simple persisted reopen
- ordered-list marker selection
- repeated-text occurrence selection
- bullet-list selection
- table header/body-row selection with no invalid table descendants
- popover `Ctrl+L` handoff for draft, loading, and completed states

If you change markdown rendering rules, add a new fixture for the affected content shape before shipping the change.

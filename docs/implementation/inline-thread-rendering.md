# Inline-Thread Rendering

This document defines the rendering invariants that keep inline-thread
highlights attached to the right text. For product behavior, see
[Inline threads](../features/inline-threads.md).

## Core invariant

A thread anchor is the half-open range `[startOffset, endOffset)` in a
versioned, canonical selectable-text stream for one message's
`[data-message-content]` root.

`highlightedText` is useful metadata, but it is not used to relocate the thread
by substring search. Substring matching is ambiguous for repeated text and
breaks across Markdown structure.

The current stream version is `markdown-structure-v2`.

## Canonical stream

`frontend/app/home/components/markdownSelectableStream.ts` defines the
structural boundaries shared by:

- browser-selection capture
- range restoration
- persisted marker insertion
- overlay measurement
- source text sent to the thread prompt

The DOM-side index in `selectableTextIndex.ts` walks visible message content and
creates:

- text segments for normal text nodes
- atomic segments for elements with canonical selection text
- virtual boundary segments between Markdown structures

Product chrome and elements marked `data-selection-exclude` do not participate.

Important boundaries include:

- newlines between adjacent block or list regions
- tabs between table cells
- newlines between table rows

Formatter-only whitespace between rendered block elements is ignored so it does
not double-count structural boundaries.

## Selection capture

After assistant-message `pointerup`, `useHomeThreads.ts` waits for the browser
selection to settle and then:

1. confirms the selection is inside one message content root
2. maps the DOM range to canonical offsets
3. trims leading and trailing whitespace
4. stores the selected text, offsets, source ID, and stream version

The browser selection remains available for normal copying. Orchard can rebuild
the range from offsets after focus moves to the popover.

## Persistence

For persistent threads, the chat route stores:

- `source_message_id`
- `highlighted_text`
- `start_offset`
- `end_offset`
- `selection_stream_version`

Missing or unknown local versions currently normalize to the default v2 stream.
Any future stream change that alters offsets requires an explicit compatibility
or migration decision.

## Marker rendering

`MarkdownWithThreads.tsx` walks rendered HAST using the same boundary rules as
the DOM index. It splits eligible text nodes at thread boundaries and inserts
marker spans carrying the thread ID.

Marker spans are click and keyboard targets. They must not:

- be inserted directly under table structure elements
- wrap hidden KaTeX MathML
- include code-block controls or other excluded chrome
- change the canonical text order

Selections crossing tables are represented by legal fragments inside cells,
while virtual tabs and newlines preserve the continuous canonical range.

## Visual overlay

`ThreadHighlightOverlay.tsx` is the primary visual layer for active and
persisted highlights.

It measures marker fragments or a restored DOM range, converts
`getClientRects()` results into message-relative coordinates, and merges nearby
rectangles. Separate tuning handles:

- wrapped lines
- syntax-highlighted code
- inline code
- visible KaTeX layout
- table-cell boundaries

The overlay never rewrites Markdown DOM. Marker backgrounds remain a fallback
when geometry cannot be measured.

Measurements update when content, size, scroll position, or font layout changes.
Near-zero rectangles are discarded and coordinates are rounded to reduce
shimmer.

## Changes that require care

Treat these as offset-model changes, not ordinary styling:

- adding or reordering remark/rehype plugins
- changing list, table, code, math, or citation rendering
- inserting visible text inside `[data-message-content]`
- changing virtual boundary rules
- changing which nodes are atomic or excluded
- moving text between CSS-generated content and DOM text

When the stream changes, update DOM capture, HAST traversal, prompt selection
text, fixtures, and persisted compatibility together.

Styling or layout outside the message content root is lower risk.

## Verification

Run:

```bash
cd frontend
npm run test:e2e -- e2e/inline-threads.spec.js
npm run test:e2e -- e2e/persistent-inline-threads.spec.js
```

High-value cases include:

- repeated text
- ordered and unordered lists
- selections spanning Markdown boundaries
- table headers, cells, and rows
- inline and block code
- inline and display math
- overlapping threads
- reload and reopen
- active and persisted overlay geometry

## Related docs

- [Inline threads](../features/inline-threads.md)
- [Conversation branching](../features/conversation-branching.md)
- [Testing](../testing/README.md)

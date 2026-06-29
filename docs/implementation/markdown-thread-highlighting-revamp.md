# Markdown Thread Highlighting Revamp

## Purpose

This note outlines a recommended revamp for chat markdown rendering, inline thread anchoring, and highlight display.

The immediate product goal is to add GitHub-flavored markdown table support. The deeper engineering goal is to make thread selection and persisted highlighting reliable across all rich markdown structures: paragraphs, lists, code blocks, math, citations, and tables.

The current implementation is already anchored by offsets rather than substring matching, which is the correct foundation. The weakness is that those offsets are derived from the incidental rendered DOM text stream, and persisted highlights are drawn by splitting markdown text nodes into clickable spans. That works, but it fragments in code and math and would become more fragile with tables.

This revamp should be treated as a markdown rendering and thread highlighting architecture change, not just a table plugin addition.

## Intended Outcome

The user-facing result should be that markdown-rich chat responses feel stable and natural to select, thread, revisit, and read.

When a user highlights text in a response:

- The highlighted text should remain anchored to the same visible content after the thread opens, the side panel closes, the page reloads, or the conversation is revisited.
- Persisted highlights should look smooth and continuous, not broken into distracting fragments by renderer internals.
- Code-block highlights should preserve exact code text, indentation, and line breaks while avoiding fragmented token-by-token backgrounds.
- Math highlights should support subexpression selection where feasible and display cleanly across KaTeX's nested markup.
- Table highlights should behave like spreadsheet selection: tabs between selected cells, newlines between selected rows, and visual highlighting that reads naturally across cell boundaries.
- The same selected content should produce consistent prompt context, copied text, visible highlight placement, and thread reopen behavior.

The ideal experience is that users do not need to know whether the highlighted content came from a paragraph, list, code block, equation, citation, or table. Thread anchors should feel consistent across all of them.

## Goals

- Add markdown table rendering with intuitive spreadsheet-like selection behavior.
- Define a canonical selectable text stream for rendered markdown.
- Use the same stream rules for selection capture, active highlight restoration, and persisted thread rendering.
- Preserve persisted thread highlights across reloads and future renderer changes.
- Improve visual smoothness so highlights feel continuous instead of bumpy or fragmented.
- Keep code, math, and tables selectable without letting renderer internals leak into user-facing behavior.

## Non-Goals

- Do not replace the chat markdown renderer wholesale unless the current stack blocks the model.
- Do not rely on `highlightedText` as the durable anchor. It remains metadata and prompt context only.
- Do not make table selection behave like raw markdown source. Once rendered as a table, the canonical selected text should behave like copied spreadsheet text.
- Do not require perfect visual treatment in the same change that introduces table rendering. The anchor model should come first.

## Current System Summary

The current inline-thread system has one durable anchoring model and two rendering responsibilities:

- Selection capture builds offsets from a DOM walk inside `[data-message-content]`.
- Active and persisted visual highlights restore DOM ranges from those offsets and draw an app-owned rect overlay.
- Persisted thread markers are rendered in `MarkdownWithThreads.tsx` by walking the HAST tree, tracking offsets, splitting matching text nodes, and wrapping text fragments in clickable spans.

This means:

- Active and persisted highlights use the same visual model.
- Persisted markers can remain fragmented as click targets because the overlay carries the primary visual treatment.
- Code, math, and tables can keep renderer-specific DOM while the overlay smooths the selected surface.
- Tables would add another structure where raw text-node concatenation is not enough.

## Core Problem

The app currently treats selectable text as an emergent property of the rendered DOM.

That is too implicit. Rich markdown renderers introduce many implementation details:

- Syntax highlighters wrap tokens in spans.
- KaTeX emits hidden MathML plus visible HTML.
- Lists may expose markers differently from text content.
- Tables create visual cell and row boundaries that may not exist as text nodes.
- React markdown and rehype plugins can change node shapes without changing user-visible text.

The fix is to define selectable text as an explicit canonical stream.

## Target Model

All selection-related features should use one shared model:

1. Markdown renders into visible structured content.
2. A canonical selectable text stream is derived from that rendered structure.
3. Browser selections are converted into offsets in that canonical stream.
4. Persisted threads store canonical offsets plus a stream version.
5. Active and persisted highlights restore from the same canonical offsets.
6. Visual highlight drawing is decoupled from text-node wrapping where possible.

The key invariant:

> A thread anchor is a range in a versioned canonical selectable text stream for one rendered message.

## Canonical Selectable Text Stream

The canonical stream is the user-facing text representation of a rendered message.

It should intentionally include structural separators where users expect copied text to contain separators, even if those separators do not exist as DOM text nodes.

Recommended v2 rules:

| Markdown structure | Canonical stream behavior |
| --- | --- |
| Inline text | Include visible text in DOM order. |
| Emphasis, strong, links | Include child text only. Formatting does not affect offsets. |
| Inline code | Include code text exactly as displayed. |
| Paragraph boundary | Insert one newline between adjacent block-level text regions. |
| Heading boundary | Include heading text, separated from neighboring blocks by newlines. |
| Blockquote | Include quote text. Do not include decorative quote markers. Separate block lines with newlines. |
| Unordered list item | Include item text. Do not include bullet marker. Separate items with newlines. |
| Ordered list item | Include item text. Do not include generated numeric marker. Separate items with newlines. |
| Fenced code block | Include code text exactly, preserving line breaks. Exclude code block chrome such as language label and copy button. |
| Inline math | Include visible selectable math text. Exclude hidden MathML. |
| Display math | Include visible selectable math text. Exclude hidden MathML. Preserve meaningful visual text order. |
| Citation buttons | Include visible citation token text, such as `[1]`. |
| Table cell | Include cell text. |
| Table cell boundary | Insert a tab character between cells in the same row. |
| Table row boundary | Insert a newline between rows. |
| Table header/body boundary | Do not add an extra separator beyond row newline. |
| Hidden UI/chrome | Exclude from the stream. |

Table behavior should intentionally match spreadsheet copy/paste:

```txt
Header A\tHeader B
Cell A1\tCell B1
Cell A2\tCell B2
```

This gives cross-cell selections predictable `selectedText`, stable offsets, and intuitive prompt context.

## Boundary Tokens

The stream should distinguish real text segments from structural boundary tokens.

Suggested segment types:

```ts
type SelectableSegment =
  | {
      kind: "text";
      text: string;
      start: number;
      end: number;
      source: DomTextSource | HastTextSource;
    }
  | {
      kind: "atomic";
      text: string;
      start: number;
      end: number;
      source: DomElementSource | HastElementSource;
    }
  | {
      kind: "boundary";
      text: "\n" | "\t";
      start: number;
      end: number;
      reason:
        | "block"
        | "list-item"
        | "table-cell"
        | "table-row"
        | "code-line";
      before?: SegmentSource;
      after?: SegmentSource;
    };
```

Boundary tokens matter for offsets and selected text. They usually do not have their own highlight geometry.

Renderer formatting whitespace between structural block children should not create its own stream characters. The stream should count the explicit virtual boundary, not both the renderer's newline text node and the virtual separator.

When a selection starts or ends inside a boundary token, restoration should snap to the nearest visible boundary:

- Start inside a boundary snaps to the beginning of the next visible segment.
- End inside a boundary snaps to the end of the previous visible segment.
- Leading and trailing boundary whitespace should be trimmed from `selectedText`, as whitespace is trimmed today.
- Internal tabs and newlines should be preserved.

## Stream Versioning

Changing the stream rules can shift offsets. This is unavoidable if we add structural separators that did not exist in earlier DOM-derived streams.

Persisted thread anchors should therefore include a stream version.

Recommended versions:

- `markdown-structure-v2`: canonical stream with explicit block, list, and table boundaries.

The app is still in development, so the runtime now uses `markdown-structure-v2` as the only active stream. Missing, legacy, or unknown stored values are normalized to v2 instead of carrying a second render-time path.

Old local anchors may drift and can be discarded or regenerated during this revamp. Preserving them is less valuable than keeping the renderer simple enough to make table-safe highlighting reliable.

Future migration options, if durable anchors become production data:

1. Add a `selection_stream_version` column to persisted threads.
2. Treat missing/null version according to the oldest production stream.
3. Use version-specific stream rules when restoring and rendering each thread.
4. Optionally migrate old offsets only when there is a verified deterministic mapping.

Migration should be conservative. For old messages that contain markdown table source, enabling GFM may radically change the rendered stream. Without a version guard, those old anchors could move.

If a single message contains both legacy and v2 threads during a transition, render the message with the modern markdown renderer but restore each thread against its own stream version. That may require the legacy stream adapter to understand the modern DOM well enough to emulate the old text order for non-table content. If that becomes unreliable for old pipe-table text, prefer a visible fallback over silently attaching the thread to the wrong text.

## Shared Traversal Rules

The DOM walker and HAST walker should not independently invent the selectable stream.

They can have separate adapters, but they should consume the same stream rule definitions.

Recommended split:

- `markdownSelectableStreamRules`: tag-level policy for inclusion, exclusion, boundaries, and atomic text.
- `buildDomSelectableTextIndex(root, version)`: captures selections and restores DOM ranges.
- `buildHastSelectableTextIndex(tree, version)`: annotates persisted thread markers during markdown rendering.
- Shared tests that feed equivalent DOM/HAST fixtures and assert identical canonical text.

This is the heart of the revamp. Tables, code, math, and lists become ordinary users of the same contract instead of special cases added in separate places.

## Visual Highlight Strategy

Correct offsets and smooth visuals should be treated as related but separate concerns.

The current persisted marker approach wraps matching text fragments in clickable spans. This makes click behavior simple, but it also makes the background look fragmented in code and math because the renderer splits text into many nodes.

Recommended direction:

1. Keep offset-based anchors as the source of truth.
2. Reconstruct DOM ranges from offsets for visible thread anchors.
3. Draw highlight backgrounds with a range-based mechanism.
4. Keep inline spans or small affordances for click targets, but do not rely on span backgrounds as the primary highlight visual.

Implemented visual path:

- Use `ThreadHighlightOverlay` for active and persisted thread highlights.
- Restore DOM ranges from canonical offsets, measure `Range.getClientRects()`, and merge nearby rects into a smoother app-owned highlight surface.
- Tune merge rules for math, code, and table contexts without rewriting renderer output.
- Keep existing inline marker spans as transparent or low-visual click targets.
- Add a small thread affordance near the range if text-only click targets are too hard to discover.

Fallback path:

- If overlay measurement fails, keep existing span backgrounds as the final functional fallback.
- Keep span styling with `box-decoration-break`, low padding, and special table/code/math styles.

This lets the app smooth fragmented markdown, code, table, and KaTeX selections with one visual model while preserving functional persisted markers.

## Click Target Strategy

If visual background moves to a range overlay, we still need thread interaction.

Options:

1. Keep existing inline marker spans as click targets but reduce their visual styling.
2. Add a small marker button at the start or end of a highlighted range.
3. For table selections, add a marker near the first selected cell or the selected range boundary.
4. Use event delegation on marker spans so fragmented spans still activate the same thread.

Recommended first step:

- Keep the current inline marker spans for click behavior.
- Make their background transparent when a range highlight is available.
- Preserve hover/focus styling so the user understands the highlighted text is interactive.

This minimizes product churn while improving visual smoothness.

## Table Support Plan

Once the canonical stream contract exists, table support should be added as a consumer of that model.

Implementation shape:

1. Add `remark-gfm` to the markdown remark plugin list.
2. Add table styles under `.markdown-content`.
3. Teach stream rules about `table`, `thead`, `tbody`, `tr`, `th`, and `td`.
4. Insert tabs between cells and newlines between rows.
5. Ensure table chrome and CSS decorations do not affect selected text.
6. Add table-specific inline thread fixtures and tests.

Table visual behavior:

- Highlight inside one cell should look like normal text highlight.
- Highlight across cells should preserve internal tabs in `selectedText`.
- Highlight across rows should preserve internal newlines.
- Persisted highlight should reopen the thread from any selected cell text.
- Table layout must not shift when markers are rendered.
- Long tables should scroll or wrap according to table design, but offsets must remain stable.

## Edge Cases To Handle

### Existing Threads

Existing persisted offsets must not silently change. Missing stream version should mean legacy behavior.

### Tables In Old Messages

Old messages may contain pipe-table markdown that currently renders as plain text. After GFM is enabled, those messages may render as tables. Any existing thread offsets on those messages should use legacy stream rules unless migrated.

If a legacy anchor lands inside source text that is now transformed into a rendered table, migration should be opt-in and test-backed. Otherwise, show the thread in the panel metadata but avoid drawing an incorrect inline highlight.

### Message Content Identity

Offsets are only stable for a specific source message body rendered under a specific stream version.

Persisted assistant messages are effectively immutable today, which makes offset anchoring viable. If future features allow editing, regenerating, or normalizing stored assistant content after threads are created, thread anchors need either:

- a message content hash stored with the anchor, or
- an explicit invalidation/migration path when content changes.

Do not silently reuse offsets after source content changes.

### List Markers

Generated list markers are visual structure, not message text. New v2 anchors should not include bullets or ordered numbers in canonical text.

If a browser selection starts on a marker, capture should snap to the item text boundary.

### Code Blocks

Code block headers, traffic dots, language labels, and copy buttons should remain excluded.

Code text should preserve exact line breaks and indentation. Syntax-highlight spans should not affect offsets or visual continuity.

### Inline Code

Inline code should be text, not atomic. Users should be able to select subranges inside inline code.

### Math

Hidden KaTeX MathML should remain excluded.

Visible KaTeX should remain selectable. Avoid making an entire formula atomic unless the product intentionally gives up subexpression selection. The current product supports selecting pieces like `bc-ad`, so v2 should preserve subexpression selection where feasible.

Math visual highlights should be range-based when possible because nested KaTeX markup fragments easily.

### Citations

Citation controls should contribute their visible token text, such as `[1]`, when selected.

Citation buttons should remain clickable and should not be wrapped in a way that breaks source-tray behavior.

### Overlapping Threads

The current renderer drops overlapping ranges. The revamp should decide a product rule:

- Disallow overlapping selections at creation time, or
- Allow overlaps and render the active/topmost thread specially, or
- Merge visual highlights but keep separate click affordances.

Recommended initial rule: continue preventing overlapping persisted markers, but make the limitation explicit in validation and tests.

### Streaming Messages

Thread selection is currently disabled for streaming messages. Keep that behavior unless the anchoring model is extended to handle moving offsets during stream updates.

### Browser Support

The overlay uses standard DOM range geometry and absolutely positioned elements. The functional fallback remains span-based if a range cannot be restored or measured.

### Accessibility

Thread affordances should be keyboard-focusable.

If highlights become range overlays, there should still be a semantic control for opening the thread. Do not rely on color alone.

## Recommended Work Sequence

### Phase 1: Spec And Tests For The Stream

- Document `markdown-structure-v2` rules.
- Add unit tests for canonical text generation.
- Cover paragraphs, headings, lists, code, math, citations, and tables.
- Add DOM/HAST equivalence tests where practical.

No visible UI behavior needs to change in this phase.

### Phase 2: Shared Stream Infrastructure

- Refactor DOM selection capture to use versioned stream rules.
- Refactor HAST thread rendering to use the same stream rules.
- Normalize dev-stage anchors to `markdown-structure-v2` instead of preserving `legacy-dom-v1`.
- Add stream version to new thread creation.

This phase is mostly plumbing. The UI should still look roughly the same.

### Phase 3: Table Rendering

- Add GFM table parsing.
- Add table styles.
- Add table stream rules: tabs between cells, newlines between rows.
- Add E2E coverage for selecting within and across table cells.
- Verify persisted threads survive reload and panel reopen.

### Phase 4: Smooth Persisted Highlight Visuals

- Render persisted visual highlights from restored ranges where supported.
- Keep marker spans or add thread affordances for interaction.
- Change code/math tests so fragmentation is no longer expected as the ideal behavior.
- Add screenshot or geometry checks for code, math, and table highlights.

### Phase 5: Polish And Migration

- Decide whether to migrate old anchors.
- Add diagnostics for anchor restoration failures.
- Consider showing a subtle fallback if an old anchor cannot be restored after renderer changes.

## Testing Plan

High-value tests:

- Canonical stream for plain paragraphs.
- Canonical stream across paragraph boundaries.
- Canonical stream for unordered and ordered lists without markers.
- Canonical stream for code blocks with preserved newlines.
- Canonical stream for inline and display math with hidden MathML excluded.
- Canonical stream for citations.
- Canonical stream for tables with tabs and newlines.
- Selection inside one table cell.
- Selection across cells in one row.
- Selection across multiple table rows.
- Persisted table highlight after reload.
- Missing or legacy persisted stream versions are normalized to v2 during the dev-stage revamp.
- Code highlight no longer requires multiple visible background fragments when range highlighting is available.
- Math subexpression selection remains possible.

Manual QA:

- Copy selected table text and paste into a text editor or spreadsheet-like surface.
- Select from paragraph into table and table into paragraph.
- Select long wrapped table cell text.
- Select code spanning multiple syntax-highlight tokens.
- Select display math fractions and superscripts.
- Open thread panel from highlighted text using mouse and keyboard.

## Success Criteria

The revamp is successful when:

- Adding `remark-gfm` tables does not destabilize existing inline threads.
- New table selections store intuitive tab/newline `selectedText`.
- DOM selection capture and HAST marker rendering agree on offsets by construction.
- Persisted highlights in code and math are visually smoother than today's fragmented spans.
- Existing dev-stage persisted highlights either restore through v2 or are regenerated without keeping legacy runtime branching.
- Future markdown plugins can be evaluated by asking how they affect the canonical stream, instead of rediscovering offset behavior ad hoc.

## Recommendation

Proceed with the canonical stream work before enabling table rendering.

Table support should be the first feature built on `markdown-structure-v2`, not an independent one-off addition. That sequencing gives us spreadsheet-like table behavior, protects existing thread anchors, and creates the right place to fix the long-standing fragmented highlight experience for code and math.

## Implementation Status

The initial revamp has been implemented.

Current implementation notes:

- `markdown-structure-v2` is the default stream for new selections.
- Missing, legacy, or unknown stream versions are treated as `markdown-structure-v2`.
- Persistent thread rows store `selection_stream_version`.
- DOM selection capture and HAST inline-thread rendering both use shared markdown boundary rules.
- GFM table parsing is enabled with `remark-gfm`.
- Table selection uses spreadsheet-style tabs between cells and newlines between rows in `highlightedText`.
- Table marker insertion is table-safe: marker spans are only inserted inside legal text containers such as `td` and `th`, never directly under table structure.
- Active and persisted visual highlights are drawn by `ThreadHighlightOverlay` from restored DOM range geometry.
- Math, code, and table highlights use context-aware rect merging to reduce fragmented visual chips without changing markdown, KaTeX, code, or table DOM structure.
- Inline marker spans remain as keyboard/mouse click targets, but their background becomes transparent when overlay highlights are active.
- The span-background fallback remains for failed range restoration or measurement.

Verification performed:

- `npm run test`
- `npm run lint`
- `NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=e2e-anon-key npm run build`
- `npm run test:e2e -- inline-threads.spec.js persistent-inline-threads.spec.js`

Known residual constraints:

- Overlapping persisted thread ranges are still normalized by dropping later overlaps.
- Old pipe-table anchors remain legacy anchors; they are not auto-migrated into table-aware offsets.
- Overlay smoothing is geometry-based; unsupported or failed measurements use the existing span fallback.

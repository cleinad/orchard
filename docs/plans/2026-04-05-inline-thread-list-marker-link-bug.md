# Inline Thread Durable Link Bug

## What This Doc Covers

This doc records a durable-link bug class in the inline-thread flow on `/home`.

It focuses on the case where:

- the user highlights text that visually begins with an ordered-list marker such as `3.`
- the selection popover and thread panel work correctly while active
- closing the thread panel removes the visible source highlight
- the source text does not regain its clickable inline thread marker

This started from an ordered-list reproduction, but the underlying issue is broader:

- ordered-list markers
- bullet lists
- repeated text in the same message
- selections that cross markdown/render boundaries
- other cases where visible selection text is not a stable durable locator

This is a behavior diagnosis and fix-direction note. No implementation is included here.

## Symptom

Observed interaction:

1. The user highlights assistant text inside a numbered list item.
2. The popover appears and the active source text stays highlighted.
3. The user asks a question and it graduates into the thread panel.
4. The thread answers normally.
5. While the thread panel is open, the original source range remains visibly highlighted.
6. After closing the thread panel, the clickable inline thread highlight is gone.

From the user’s perspective, the thread connection appears severed.

## Root Cause

This is not primarily a thread-id or source-message-id mismatch.

The bug comes from using two different linkage strategies:

- **Active state**
  - while the popover or thread panel is open, the source highlight is reconstructed from saved selection offsets and a `Range`
- **Durable state**
  - after the panel closes, the clickable inline thread marker is rebuilt by exact text matching against rendered markdown text

Those two strategies are not equivalent.

### Active state is offset-based

`useHomeThreads` captures the selection as:

- source message id
- selected text
- start offset
- end offset
- anchor rect

The active highlight is later rebuilt from the stored offsets, so it survives the popover and thread-panel lifecycle even after the browser selection is cleared.

### Durable state is string-matching based

`MarkdownWithThreads` does not use offsets. It looks for each thread’s `highlightedText` by exact substring match in rendered markdown text and wraps the first non-overlapping match.

That means durable inline links only work when the stored `highlightedText` exactly matches real text-node content in the rendered markdown tree.

## Why Ordered Lists Fail

Ordered-list markers such as `1.`, `2.`, `3.` are usually rendered via list styling, not as part of the actual text node content of the list item.

In this codebase, ordered lists are styled with CSS list markers:

- `.markdown-content ol { list-style: decimal; }`

That means the browser selection can visually include the marker, while the markdown thread-matching code later searches only the underlying list item text.

Example shape:

- visual user selection: `3. The event loop flushes microtasks first`
- real searchable list item text: `The event loop flushes microtasks first`

So the following happens:

1. the active highlight works, because offsets point to the actual selected range
2. the durable thread is created correctly
3. closing the panel clears the transient active highlight
4. the inline renderer tries to reattach the thread by exact string match
5. the stored string includes `3. ` but the rendered text nodes do not
6. no durable clickable highlight is rendered

This is consistent with the report that the same flow works on “regular” plain text but fails on a selection starting with `3.`

## Why This Is A Larger Class Of Bugs

The ordered-list case is only one instance of the same architectural mismatch.

The durable path currently assumes that `highlightedText` is a safe durable locator. It is not.

Other fragile cases include:

- **Repeated text**
  - exact substring matching can attach to the wrong occurrence, even when the original selection was correct
- **List markers and bullets**
  - visible prefixes can be produced by list rendering rather than real text nodes
- **Selections across markdown structure**
  - rendered text can be split across child nodes in ways that make later exact matching fragile
- **Whitespace normalization**
  - the browser selection string and the later rendered text-node stream may not normalize spacing the same way

The core bug is not “ordered lists are broken.”

The core bug is “durable inline-thread reconstruction depends on exact text matching instead of a structural locator.”

## What Is Still Working

The standard thread-creation path still appears intact:

- the chat route still stores `source_message_id` and `highlighted_text`
- the home page still adds thread metadata on thread creation
- the existing Playwright persistent reopen coverage still passes for simple plain-text selections

So the regression surface is narrower than “all inline threads are broken.”

## Recommendation

The cleanest fix is to make durable inline-thread rendering offset-based, not text-matching based.

This is the fix I recommend.

It solves a whole class of structural-linking bugs rather than patching today’s ordered-list symptom only.

### Recommended direction

Persist selection offsets for threads in addition to the existing text:

- source message id
- start offset
- end offset
- highlighted text

Then render durable inline thread markers from offsets, using the same plain-text coordinate system already used by the active highlight logic.

This aligns the durable path with the active path and removes an entire class of bugs caused by presentation-only prefixes, repeated text, or markdown structure.

### Why this is the cleanest fix

- it solves ordered-list markers and similar structural cases at the root
- it solves repeated-text attachment problems more reliably than first-match substring search
- it removes reliance on fragile exact substring matching
- it keeps active and durable thread linkage on the same representation
- it avoids heuristics based on visual prefixes

### Why a text-normalization patch is not the cleanest fix

A smaller patch could try to strip visible list markers like `3. ` from the stored text before durable matching.

That might help this specific bug, but it is not a durable solution because the same mismatch class can also appear with other markdown presentation structures or whitespace normalization boundaries.

It is better treated as a structural-linking problem than a string-cleanup problem.

## Scope Across Other Formats

This offset-based direction is also the right foundation for other troublesome formats, with some caveats.

- **Lists**
  - yes, this is exactly the kind of bug it fixes cleanly
- **Repeated text**
  - yes, offsets are much safer than “first matching substring”
- **Inline formatting**
  - yes, offsets are safer when text is split across nested markdown nodes
- **Math**
  - better than string matching, as long as the durable renderer and selection capture operate over the same rendered text-node representation
- **Code**
  - better in principle for durable locating, but code regions may still need explicit product decisions about whether inline threads should attach there at all

So this does not magically remove every rendering nuance, but it is still the right architectural move because it gives the durable path the same source of truth as the active highlight path.

## Suggested Implementation Shape

High-level direction only:

1. Extend thread creation payloads and persistence to carry start/end offsets for the source selection.
2. Expose those offsets in thread metadata returned to the home UI.
3. Replace `MarkdownWithThreads` durable matching by `highlightedText` substring with offset-aware wrapping for the source message content.
4. Keep `highlightedText` as display metadata, but stop relying on it as the primary durable locator.

## Verification Targets

After implementing the fix, validate at minimum:

- plain paragraph text still creates and reopens inline threads
- ordered-list selections beginning with `1.`, `2.`, `3.` remain clickable after closing the thread panel
- unordered-list items with bullets still work
- repeated text in the same message no longer depends on first-match substring behavior
- inline formatting boundaries still preserve the correct source span
- math-adjacent or other structurally complex selections degrade predictably if not fully supported
- persistent and temporary inline-thread flows remain intact

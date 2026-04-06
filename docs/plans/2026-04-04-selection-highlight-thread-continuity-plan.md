# Selection Highlight And Thread Continuity Plan

**Goal:** Make text selection in learning mode behave as one continuous interaction:
- the selected text stays visibly highlighted
- the popover appears immediately
- promoting to `ThreadPanel` preserves that highlight
- closing the panel still leaves a reopenable thread link when appropriate

## Problem Summary

The current flow mixes three different states that are not guaranteed to stay in sync:

- the browser's native text selection
- the temporary visual highlight managed through the Custom Highlight API
- the persisted thread metadata used to reopen a thread later

Because those states are created and cleared by different mechanisms, users can end up with:

- text visibly selected but no popover
- a popover with no visible highlight
- a draft thread panel with no durable way to reopen it after close

## Observed Symptoms

- Sometimes the first highlight remains visible, but the popover does not appear until a second click.
- When the second click happens, the popover appears but the visible highlight disappears.
- Sometimes the popover appears immediately, but the selected text no longer looks highlighted.
- If the thread panel is opened from that state, the visual connection to the source text is lost.
- If the panel is then closed before any message is sent, there may be no remaining affordance to reopen that draft context.

## Root Cause

### 1. Selection capture is too tightly coupled to `pointerup`

The app currently reads `window.getSelection()` directly from the assistant message `pointerup` path. That is fragile because the browser is still resolving the final selection and focus state at that moment.

Result:
- sometimes the app samples the final selection
- sometimes it samples stale or collapsing selection state

### 2. Popover state and highlight state are separate

The popover stores a frozen payload:
- selected text
- anchor rect
- source message id

The visible highlight is stored separately as a cloned range in the Custom Highlight API.

That means the app can successfully render the popover while failing to render the corresponding highlight, or vice versa.

### 3. Visual highlighting depends on a temporary layer

The visible source highlight during selection is currently a transient UI artifact, not the same durable artifact used for inline thread reopening.

So there is no single source of truth for:
- what text is currently selected
- what text is currently active in the panel
- what text should remain reopenable later

### 4. Draft threads are not durable until a real thread id exists

In persistent mode, a draft thread opened from the popover does not receive a real thread id until the first thread-panel send. If the panel is closed before that point, there is no persisted thread metadata to render an inline reopen affordance.

## Ideal Solution

Treat selection, source highlighting, and thread continuity as one state machine instead of three loosely connected states.

### Desired interaction

When a user highlights text:
- the selection is resolved once, after the browser has finalized it
- the selected text remains visibly highlighted
- the popover appears immediately against that exact selection

When a user promotes to the thread panel:
- the same selection remains the active source highlight
- the popover closes without clearing the active source highlight
- the thread panel inherits the exact source selection context

When a user closes the thread panel:
- if the thread has been persisted, the inline reopen affordance remains
- if the thread is still only a draft, the product should either preserve a draft affordance or intentionally discard it with a clear rule

## Concise Implementation Direction

### 1. Introduce one authoritative active selection model

Create a single "active learning selection" object that owns:
- source message id
- selected text
- stable range or range-derived anchor data
- current UI mode: popover or thread panel
- persistence status: draft or persisted thread

The popover and thread panel should both derive from this object instead of each maintaining partially overlapping state.

### 2. Decouple selection resolution from raw `pointerup`

Selection should be finalized only after the browser has settled it.

The app should:
- treat `pointerup` as a signal that selection may have changed
- resolve the actual selection in a safer follow-up step
- only create highlight and popover state once that final selection is confirmed valid

### 3. Keep source highlighting owned by the active selection model

The visible highlight should remain active for as long as the selection-backed thread context is active.

That means:
- opening the popover should not depend on native browser selection remaining visible
- opening the thread panel should not clear the source highlight
- only explicit dismissal or intentional context replacement should clear it

### 4. Separate "draft thread context" from "persisted thread metadata"

The UI should explicitly model the difference between:
- a draft thread context tied to a source selection
- a persisted thread with a real thread id and reopenable inline affordance

This avoids overloading the source highlight as if it were already a durable thread link.

### 5. Define the close behavior up front

The implementation should choose one explicit rule for draft thread closure:

- either draft thread contexts survive close and remain reopenable
- or draft thread contexts are intentionally ephemeral and are discarded on close

Either choice can work, but it needs to be deliberate and reflected in the UI model.

## Recommended Product Rule

The cleanest rule is:

- selection highlight remains while the popover or the derived thread panel is active
- persisted threads become inline reopenable links
- unsent draft threads are treated as temporary unless the product explicitly wants draft reopening

This keeps the interaction consistent without inventing hidden semi-persisted thread state.

## Non-Goals

- Do not patch this by only tweaking one event listener.
- Do not treat the browser's native selection highlight as the reliable long-term source highlight.
- Do not create a server thread immediately just to work around UI-state drift.

## Implementation Outcome To Target

After the fix:

- highlighting text always leaves a visible active highlight
- the popover always appears from that same selection
- promoting to the thread panel preserves the source highlight
- replacing one active selection with another behaves predictably
- persisted threads remain reopenable from the message body
- the behavior of unsent draft threads is explicit rather than accidental

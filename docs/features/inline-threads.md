# Inline Threads

## What This Doc Covers

This doc describes the learning-mode selection workflow on the home screen.

It covers:

- how highlighted assistant text becomes a popover
- how the popover graduates into the right-side thread panel
- how source highlighting is preserved across that transition
- how `Ctrl+L` behaves in draft, loading, and completed states
- how the feature differs between persistent and temporary chat

This is primarily a behavior and state-model doc for future implementation context. It is not just a component note for `ThreadPanel`.

## Overview

Inline threads let the user branch off from a specific span of assistant text without leaving the main conversation flow.

The interaction has two layers:

- **Selection popover**
  - optimized for fast, concise exploration of the highlighted text
- **Thread panel**
  - optimized for deeper follow-up with longer responses and multi-turn context

The selected source text remains the anchor for both layers.

## User Flow

1. The user highlights text inside an assistant message while learning mode is enabled.
2. The app resolves the selection and keeps the source text visibly highlighted.
3. A selection popover appears near the highlighted text.
4. The user can ask a concise question in the popover.
5. The interaction may stay in the popover, auto-graduate to the thread panel, or be manually promoted with `Ctrl+L`.
6. Once in the thread panel, follow-up responses are longer and no longer use the concise popover behavior.

## Highlight And Selection Behavior

The core contract is:

- the source text should stay visibly highlighted when the popover appears
- promoting the popover to the thread panel should preserve that source highlight
- replacing the active selection should replace the active source highlight
- closing the active thread context should clear the temporary source highlight

Implementation-wise, the active selection is treated as a stable semantic object, not just a transient browser selection.

The app stores:

- source message id
- selected text
- anchor rect for popover placement
- text offsets needed to rebuild the highlight

That lets the app reapply the source highlight even after the browser’s native selection has been cleared.

## Popover Behavior

The popover is the lightweight exploration surface.

Key behavior:

- It appears only for selections inside assistant messages.
- It is anchored to the selected text.
- It supports a built-in `Define` action plus custom questions.
- Popover requests use concise behavior.
- If the response is too large or structurally complex, the popover auto-graduates into the thread panel.

The popover should be thought of as a quick first-pass exploration tool, not the main place for deep multi-turn discussion.

## Thread Panel Behavior

The thread panel is the deeper exploration surface for the selected text.

Key behavior:

- It opens on the right side of the home screen.
- Requests from the thread panel are not concise.
- It can open with:
  - seeded question/answer history
  - unsent draft input
  - an already-submitted loading question
- It can represent an in-flight request without turning that request back into editable draft text.

This is the main distinction from the popover:

- popover: concise exploration
- thread panel: longer threaded follow-up

## Keyboard Interactions

### `Ctrl+L` while the popover is open

`Ctrl+L` promotes the active popover context into the thread panel.

Behavior depends on state:

- **Unsent draft**
  - the thread panel opens with the text still in the input, unsent
- **Submitted and loading**
  - the thread panel opens with the user turn already committed
  - the input is cleared
  - the loading state remains visible
- **Completed concise response**
  - the thread panel opens with the seeded question/answer history
  - any additional follow-up draft remains unsent in the panel input

### `Ctrl+L` while the thread panel is open

If no popover is currently overriding the shortcut, `Ctrl+L` closes the thread panel.

If a popover is active, the popover’s `Ctrl+L` behavior takes precedence and replaces the active thread context instead of closing it.

### `Escape`

The popover can be dismissed with `Escape`.

Panel close behavior follows the panel-level keyboard handling and close controls.

## State Rules And Edge Cases

There are three important text-entry states in the popover flow:

- **Draft**
  - text has been typed but not submitted
- **Loading**
  - text has already been submitted and the request is still in flight
- **Completed**
  - concise response has returned and can seed thread history

This distinction matters because a submitted loading question must not be treated like unsent draft input.

Other important rules:

- Replacing the active selection replaces the active popover/thread source context.
- Promoting to the thread panel does not sever the source highlight.
- Persisted threads become reopenable from the message body.
- Temporary threads remain session-local.
- Unsent draft thread contexts are transient unless later backed by a real thread.

## Persistent Vs Temporary Chat

The interaction model is the same in both modes, but persistence differs.

### Persistent chat

- Threads can be persisted.
- A real thread id is created when needed.
- Persisted threads become reopenable from the originating assistant message.

### Temporary chat

- Thread ids are client-generated.
- Thread metadata and history stay in local client state.
- The interaction works the same way from the user’s perspective, but nothing is stored durably.

## Implementation Notes

This feature is coordinated across a small state graph rather than a single component.

Important concepts:

- **Active selection**
  - stable source selection used for highlight reconstruction and popover placement
- **Popover state**
  - the current concise exploration context
- **Thread panel state**
  - the deeper follow-up context, including draft input, loading-question handoff, and seeded messages

The selection lifecycle is intentionally decoupled from raw browser selection timing. The app resolves the selection after the browser settles it, then clears native selection and relies on the persistent highlight layer.

The popover-to-panel handoff is also state-aware:

- draft input transfers as draft input
- in-flight requests transfer as loading thread state
- completed concise exchanges transfer as seeded thread history

## Key Files

- `frontend/app/home/components/useHomeThreads.ts`
  - owns active selection state, highlight persistence, popover state, and thread-panel handoff state
- `frontend/app/home/components/TextSelectionPopover.tsx`
  - owns concise popover requests and promotion into the thread panel
- `frontend/app/home/components/ThreadPanel.tsx`
  - owns deep follow-up thread interaction and panel-specific shortcut behavior
- `frontend/app/home/page.tsx`
  - wires the popover, thread panel, and thread-state orchestration together
- `frontend/app/api/chat/route.ts`
  - supports concise popover requests and non-concise thread-panel requests

## Verification And Constraints

Important verified behaviors:

- source text remains highlighted when the popover appears
- `Ctrl+L` from the popover preserves draft, loading, and completed states correctly
- in-flight popover requests can transfer into the thread panel without reverting to draft text
- thread-panel requests continue to use longer-response behavior

Current constraint:

- the behavior has been exercised in Chrome and the implementation assumes the browser environment supports the highlight and selection behavior used by the home screen

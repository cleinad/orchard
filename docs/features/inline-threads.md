# Inline Threads

## What This Doc Covers

This doc describes the learning-mode inline-thread workflow on the home screen.

It covers:

- how highlighted assistant text becomes a popover
- how submitted popover questions become thread sessions immediately
- how one visible thread panel coexists with multiple background thread sessions
- how source highlighting and durable inline markers work together
- how the feature differs between persistent and temporary chat

This is primarily a behavior and state-model doc for future implementation context. It is not just a component note for `ThreadPanel`.

## Overview

Inline threads let the user branch off from a specific span of assistant text without leaving the main conversation flow.

The interaction has two layers:

- **Selection popover**
  - optimized for fast question entry and draft promotion
- **Thread panel**
  - optimized for deeper follow-up and live thread state

Submitting a popover question no longer renders a concise answer inside the popover. Instead it creates a thread session immediately, opens the right-side panel on that session, and renders a durable inline marker on the selected span.

## User Flow

1. The user highlights text inside an assistant message while learning mode is enabled.
2. The app resolves the selection and keeps the source text visibly highlighted.
3. A selection popover appears near the highlighted text.
4. The user can ask a question directly from the popover or press `Ctrl+L` to open a draft thread.
5. On submit, the app creates a thread session immediately and opens the thread panel on that session.
6. The source span gets a durable inline marker immediately in `loading` state.
7. The user can click away, select another span, and submit another thread while earlier threads keep running in the background.
8. Background completions update their inline markers to `ready` or `error` without stealing the panel.
9. Clicking any inline marker reopens that thread session in the panel.

## Highlight And Marker Behavior

There are two different visual systems:

- **Active source highlight**
  - singleton
  - used for the current popover or active panel session
  - rebuilt from offsets with the `CSS.highlights` registry
- **Durable inline thread marker**
  - many at once
  - appears immediately on submit
  - carries thread lifecycle state: `loading`, `ready`, or `error`
  - is the long-lived reopen surface

The key contract is:

- the source text should stay visibly highlighted when the popover appears
- opening a thread from the popover should preserve that active source highlight
- replacing the active selection should replace the active highlight
- closing the active thread panel should clear the active highlight
- submitted threads should remain discoverable through durable inline markers even after the active highlight moves elsewhere

Those offsets are measured relative to the message body root, not the entire chat row. In practice that means the offset space is the rendered text inside `[data-message-content]`, excluding labels, timestamps, and other outer chrome.

## Popover Behavior

The popover is now only the lightweight entry surface.

Key behavior:

- It appears only for selections inside assistant messages.
- It is anchored to the selected text.
- It supports a built-in `Define` action plus custom questions.
- It does not own the request or response lifecycle after submit.
- `Enter` submits immediately into a thread session.
- `Ctrl+L` promotes unsent draft text into the thread panel without sending it.

The popover should be thought of as quick thread creation, not as a place to read answers.

## Thread Panel Behavior

The thread panel is the deeper exploration surface for the selected text.

Key behavior:

- It opens on the right side of the home screen.
- Requests from the thread panel answer the user's latest thread question directly while treating the selected text as local context.
- The model receives a dedicated thread context block before the latest thread question. That block separates app-owned thread rules from quoted source data, includes selected text up to the generous safety cap, the source message role/id, selection offsets, and a marked source-message excerpt so ambiguous references like "this" normally resolve to the highlighted span.
- Thread context should use the source message's parent chain, capped to the recent anchor path, plus prior thread messages. It should not include unrelated main-chat turns that happened after the selected source.
- Only one panel is visible at a time.
- The newest submitted thread session becomes the active panel session.
- Older sessions keep running in the background.
- Background completions do not steal panel focus.
- Draft input is preserved per session when the active panel switches to another thread.
- Follow-up messages can be sent with `Enter` or the panel send button.

This means the panel follows the latest explicit user action, not completion order.

## Keyboard Interactions

### `Ctrl+L` while the popover is open

`Ctrl+L` promotes the active popover draft into the thread panel.

Behavior:

- if the popover input has text, a draft thread session is created
- the panel opens on that draft session
- the draft remains unsent in the panel input

### `Ctrl+L` while the thread panel is open

If no popover is currently overriding the shortcut, `Ctrl+L` closes the thread panel.

If a popover is active, the popover shortcut takes precedence and opens the new draft session instead of closing the panel.

### `Escape`

`Escape` dismisses the popover.

Since submitted questions leave the popover immediately, dismissing the popover only affects unsent selection state.

## State Rules And Edge Cases

Important rules:

- There is only one active selection/popover at a time.
- Submitted thread sessions are tracked independently from the active selection.
- Submitted sessions can be `loading`, `ready`, or `error`.
- A durable inline marker appears immediately on submit.
- Failed threads keep their inline marker and remain reopenable.
- Background session completion updates inline marker state but does not change the active panel session.
- Persisted threads become reopenable from the message body.
- Temporary threads remain client-local.

One important distinction is that the active highlight is not the long-lived thread surface. The durable inline marker is.

## Persistent Vs Temporary Chat

The interaction model is the same in both modes, but persistence differs.

### Persistent chat

- Threads can be persisted.
- A real thread id is attached once the server returns it.
- Persisted threads become reopenable from the originating assistant message.
- Persisted thread linkage is anchored by `startOffset` and `endOffset`, not by substring matching on `highlightedText`.
- Client-side thread runtime is cached per conversation so error markers and reopenable thread state survive panel teardown, chat switching, and same-tab reloads after the thread id is known.

### Temporary chat

- Thread ids are client-generated.
- Thread metadata, thread messages, and thread status stay in local client state.
- Background thread completions still write back to the originating temporary chat even if the user switches to another chat before the answer returns.
- The interaction works the same way from the user’s perspective, but nothing is stored durably in the backend.

## Implementation Notes

This feature is coordinated across a small state graph rather than a single component.

Important concepts:

- **Active selection**
  - stable source selection used for highlight reconstruction and popover placement
- **Thread session registry**
  - tracks submitted inline-thread sessions independently of the active selection
- **Active panel session**
  - determines which thread the visible `ThreadPanel` is rendering
- **Inline thread markers**
  - merge persisted thread metadata with optimistic session markers for transcript rendering
- **Persistent thread runtime cache**
  - preserves per-thread status and client-side messages for persisted threads after the active session is torn down

The selection lifecycle is intentionally decoupled from raw browser selection timing. The app resolves the selection after the browser settles it, preserves native selection behavior for normal copy, and also rebuilds its own active highlight from offsets so the source span remains visible when focus moves into the popover.

Durable thread rendering uses the same locator model as the active highlight:

- the active highlight is rebuilt from offsets
- persisted thread metadata stores those offsets
- optimistic thread sessions store the same offsets
- the message renderer wraps the same offset span when recreating clickable inline thread markers

Selection offsets are based on a shared selectable-text index for `[data-message-content]`. Renderer chrome can be excluded with `data-selection-exclude`; KaTeX uses its visible HTML text stream while hidden MathML is excluded so math text is not counted twice.

`highlightedText` still exists as display metadata, but it is not the durable locator for reattaching a thread to message content.

## Key Files

- `frontend/app/home/components/useHomeThreads.ts`
  - owns active selection state, highlight persistence, thread-session registry, and active panel session
- `frontend/app/home/components/TextSelectionPopover.tsx`
  - owns popover rendering, question entry, and draft promotion into thread sessions
- `frontend/app/home/components/ThreadPanel.tsx`
  - renders the active thread session as a controlled panel view
- `frontend/app/home/[[...conversationId]]/page.tsx`
  - owns thread sending, persisted-thread hydration, temporary-thread persistence, and transcript marker merging
- `frontend/app/home/components/MarkdownWithThreads.tsx`
  - renders durable inline markers with status-aware styling
- `frontend/app/api/chat/route.ts`
  - handles thread requests with selected text as local context

## Verification And Constraints

Important verified behaviors:

- source text remains highlighted when the popover appears
- `Ctrl+L` from the popover preserves unsent draft input
- submitting from the popover opens the thread panel immediately
- inline markers appear immediately in `loading` state
- background thread completion does not steal the panel
- temporary-thread results survive switching to another chat before the response resolves
- failed threads keep an `error` marker and remain reopenable
- persistent error markers survive same-tab reload and reopen with cached thread state
- thread-panel follow-ups can be sent with the clickable send button
- persisted inline thread links reattach correctly for ordered-list markers, repeated-text selections, and bullet-list selections

Current constraint:

- the behavior has been exercised in Chrome and the implementation assumes the browser environment supports the highlight and selection behavior used by the home screen

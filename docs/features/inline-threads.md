# Inline Threads

Inline threads let a user highlight part of an assistant response and ask a
focused follow-up without changing the main chat.

This is Orchard's central learning interaction: a confusing term, code fragment,
equation, or claim can be explored in place while the original explanation
remains readable.

## User flow

1. Select text in a completed assistant response.
2. Enter a question in the selection popover.
3. Submit immediately or open the side panel with the question as a draft.
4. Continue the focused conversation in the thread panel.
5. Close the panel to return to the unchanged main chat.

The selected source remains highlighted. Clicking a persisted highlight reopens
its thread.

## Selection behavior

Thread creation is available from non-error assistant messages. The selection
must resolve inside one message's rendered content; selections crossing message
or product-UI boundaries are rejected.

Orchard stores:

- the source message ID and role
- the selected text
- normalized start and end offsets
- the selection-stream version used to calculate those offsets

Offsets are measured against a canonical text stream derived from rendered
Markdown. This is more stable than matching the selected substring, especially
when the same text appears more than once.

The selection popover:

- previews the selected text
- focuses its question input
- submits with Enter
- closes with Escape or an outside click
- preserves normal copy behavior
- uses `Ctrl+L` to open the thread panel when the input has a draft

## Thread context

The first thread request includes:

- the selected text
- source-message content and role
- source offsets and stream version
- the active main-chat path leading to the source
- the user's thread question

Later thread turns use their own thread-message history. They do not become
messages in the main conversation tree.

Model, response-style, and search settings are inherited from the active chat
when a thread request is submitted.

## Persistent and temporary threads

In a persistent chat:

- thread metadata is stored in `threads`
- messages are stored in `thread_messages`
- highlights and messages reload with the conversation
- persistent runs use the shared chat-run coordinator

In a temporary chat:

- thread metadata and messages remain in the temporary session state
- nothing is written to the application database
- closing the temporary chat removes its threads with it

## Thread panel

The panel shows the selected source, the thread conversation, citations when a
thread response used live search, and a composer for follow-ups.

- On desktop it opens beside the main chat and can be resized.
- On smaller screens it behaves as the active reading surface and includes a
  back-to-main control.
- Enter sends; Shift+Enter inserts a newline.
- `Ctrl+L` closes the panel unless the selection popover is active.
- Stop cancels the active thread run when possible.

## Rendering invariant

Persisted highlights must stay attached to the same semantic text after reload
and across supported Markdown structures. Rendering code must not silently
change the canonical selectable stream.

Tables, lists, code, math, citations, and overlapping highlights have additional
rules documented in [Inline-thread rendering](../implementation/inline-thread-rendering.md).

## Key implementation

- `frontend/app/home/components/TextSelectionPopover.tsx`
- `frontend/app/home/components/useInlineThreadRuntime.ts`
- `frontend/app/home/components/ThreadPanel.tsx`
- `frontend/app/home/components/MarkdownWithThreads.tsx`
- `frontend/app/home/components/ThreadHighlightOverlay.tsx`
- `frontend/app/api/threads/[threadId]/messages/route.ts`
- `frontend/app/api/chat/route.ts`

## Verification

The main browser coverage is in:

- `frontend/e2e/inline-threads.spec.js`
- `frontend/e2e/persistent-inline-threads.spec.js`

The focused renderer and route coverage is distributed across
`frontend/__tests__/app/` and `frontend/__tests__/lib/markdown.test.ts`.

## Related docs

- [Inline-thread rendering](../implementation/inline-thread-rendering.md)
- [Conversation branching](./conversation-branching.md)
- [Chat run lifecycle](./chat-run-lifecycle.md)
- [Temporary chats](./temporary-chat.md)

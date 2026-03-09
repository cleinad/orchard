# Inline Threads & Learning Mode

## Overview

A "learning mode" that lets users highlight text in assistant responses to get inline definitions and spawn threaded side conversations. Conversations become trees rather than linear chains — any assistant message (including within threads) can branch further.

## Data Model

### New `threads` table

| Column | Type | Description |
|---|---|---|
| `id` | uuid (PK) | Thread identifier |
| `conversation_id` | uuid (FK) | Parent conversation |
| `source_message_id` | uuid (FK) | The assistant message containing the highlighted text |
| `highlighted_text` | text | The exact selected text |
| `user_id` | uuid (FK) | Owner |
| `created_at` | timestamptz | |

### Changes to `messages` table

| Column | Type | Description |
|---|---|---|
| `thread_id` | uuid (nullable, FK → threads.id) | Groups messages in a thread. NULL = main conversation. |
| `parent_message_id` | uuid (nullable, FK → messages.id) | The assistant message that was highlighted. NULL = main conversation. |

Main conversation query: `WHERE thread_id IS NULL`.

### Tree structure

Threads can branch from threads. `source_message_id` in `threads` can point to any assistant message regardless of depth. The tree emerges from the chain of references:

```
Main conversation
├── msg 1 (assistant)
│   └── Thread A (highlighted "superposition")
│       ├── msg A1 (user: "Define")
│       ├── msg A2 (assistant: explains)
│       │   └── Thread A-sub (highlighted "wave function")
│       │       ├── msg A-sub-1 (user)
│       │       └── msg A-sub-2 (assistant)
│       └── msg A3 (user: follow-up)
├── msg 2 (user)
├── msg 3 (assistant)
│   └── Thread B (highlighted "entanglement")
```

## Learning Mode Toggle

- Button next to theme toggle in `HomeHeader`
- Toggles `learningMode` boolean, persisted to localStorage
- When off: existing threads remain visible/clickable, but no new threads can be created
- When on: text selection in assistant messages triggers the popover flow

## Text Selection & Popover

### Trigger
- `pointerup` listener on the message container (learning mode only)
- `window.getSelection()` to get selected text and range
- Only triggers on non-empty selections within assistant messages
- Popover positioned near selection via `getBoundingClientRect()`

### Popover contents
1. **"Define" button** — quick action, sends pre-filled prompt
2. **Text input** — "Ask something about this..."
3. After either action: concise AI response (2-3 sentences) appears in the popover
4. Below the response: a follow-up text input

### Popover lifecycle
1. Selection → popover appears (no API call yet)
2. User clicks "Define" or types question → API call with `concise: true` → response in popover
3. User asks follow-up → popover closes, `ThreadPanel` opens with all messages so far
4. Clicking outside or Escape dismisses the popover

## Thread Indicators

- Highlighted phrases in assistant messages get a subtle dashed underline + distinct text color
- Hover shows a small tooltip
- Clicking reopens the `ThreadPanel` for that thread (skips popover)
- Implemented via `MarkdownWithThreads` — custom text node renderer in ReactMarkdown that splits text nodes containing highlighted phrases and wraps matches in `ThreadIndicator` components

## Side Panel Thread View

- Slides in from the right (~460px), same pattern as `MentorDetailPanel`
- One thread panel open at a time

### Panel layout (top to bottom)
1. **Header** — highlighted phrase as a quote/chip, source context, close button
2. **Thread messages** — standard ReactMarkdown rendering, full-length responses
3. **Input area** — text input at bottom (no mic button)

## API Changes

Same `/api/chat` endpoint, extended with optional fields.

### New request fields
- `threadId` (string, optional) — continuing an existing thread
- `sourceMessageId` (string, optional) — the assistant message being highlighted (new threads)
- `highlightedText` (string, optional) — the selected text (new threads)
- `concise` (boolean, optional) — true for popover responses

### New thread flow
1. Client sends `{ message, conversationId, sourceMessageId, highlightedText, concise: true }`
2. Server creates `threads` row, saves user message with `thread_id` and `parent_message_id`
3. Builds prompt with full conversation context + highlighted text + concise instruction
4. Returns `{ message, conversationId, threadId }`

### Continuing a thread
- Popover (concise): `{ message, conversationId, threadId, concise: true }`
- Side panel (full): `{ message, conversationId, threadId }`

### System prompt modifications
- Concise: "Respond in 2-3 sentences. Be direct and definitional."
- Side panel thread: "The user is exploring a concept from the main conversation. The highlighted phrase was: '{highlightedText}'. Respond conversationally."

### Context building
- Main conversation messages (`WHERE thread_id IS NULL`) for background context
- Thread messages (`WHERE thread_id = ?`) for active exchange

## Component Architecture

### New components
- **`LearningModeProvider`** — Context provider. Holds `learningMode` boolean (localStorage). Exposes toggle + state.
- **`TextSelectionPopover`** — Floating popover on text selection. Manages positioning, "Define" button, text input, concise response display, graduation to side panel.
- **`ThreadIndicator`** — Inline component wrapping highlighted phrases. Dashed underline styling, click to open thread panel.
- **`ThreadPanel`** — Right-side panel for thread conversations. Header, message list, input.
- **`MarkdownWithThreads`** — ReactMarkdown wrapper. Takes thread data for a message, injects `ThreadIndicator` at matching text positions.

### Modified components
- **`HomeHeader`** — Learning mode toggle button
- **`page.tsx`** — `LearningModeProvider` wrapper, `TextSelectionPopover` + `ThreadPanel` in render tree, `MarkdownWithThreads` replaces bare `ReactMarkdown`, thread state management
- **`/api/chat/route.ts`** — Extended with thread fields

### Unchanged
- `SidePanel`, `MentorDetailPanel`, `CreateMentorPanel`, all hooks

## State additions to `page.tsx`
- `learningMode` (boolean, via context)
- `threads` (Map of message ID → thread metadata array, loaded with conversation)
- `activeThreadId` (string | null)
- `popoverState` ({ visible, position, selectedText, sourceMessageId } | null)

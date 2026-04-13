# Conversation Tree Design

Date: 2026-04-11
Status: Draft for review

This document captures the approved design for transcript-native conversation branching and its relationship to the existing chat and inline-thread model.

## Approved Section 1: Mental Model

A conversation becomes a tree-shaped workspace that is still read as a single linear path at any moment.

Core rules:

- A saved chat is still one conversation in the sidebar.
- Inside that conversation, any assistant reply can become a fork point.
- A branch is an alternate continuation from that full assistant reply.
- The user reads one active path at a time; the transcript below a fork point changes based on the selected branch chip.
- The model can suggest directions, but only the user creates branches.
- When the first alternate branch is created, the pre-existing continuation becomes `Main`.
- Older assistant replies can be forked later, so branching is not limited to the current head.
- Existing selection-based inline threads remain a separate feature. They are anchored side discussions, not primary path branches.

User-facing mental model:

- Chats live in the left sidebar.
- Branches live inside a chat.
- Inline threads are still their own thing.

## Approved Section 1A: Branch Lifecycle

1. A conversation starts as a normal linear chat.
2. The user clicks `+ Branch` on an assistant reply.
3. That reply now has branch chips, with the existing path preserved as `Main`.
4. The new branch becomes the selected target for the next message.
5. The bottom composer stays where it is; sending the next message writes into that new branch.
6. The branch title is derived from the fork prompt when clear, otherwise AI-generated, and editable later.
7. After send, the main transcript continues on that selected branch path.
8. Switching chips on that assistant reply swaps the downstream transcript to a sibling path.
9. Any branch can later fork again from a later assistant reply, so the structure grows as nested branch points over time.

## Approved Section 2: Navigation and UI

The default screen should still read like a normal chat. Branching becomes visible only at assistant replies that actually have alternate continuations.

### Transcript behavior

- Under an assistant reply that has branches, show a compact row of branch chips.
- The row includes the active branch, sibling branches, and `+ Branch`.
- No chips appear on ordinary replies with no branching yet.
- Clicking a chip swaps the transcript after that assistant reply to the selected branch path.
- The rest of the transcript above that point stays unchanged, so the user feels like they are switching continuations, not opening a different chat.

### Creating a branch

- Clicking `+ Branch` on an assistant reply arms a new branch target from that reply.
- The bottom composer stays in place; nothing new opens.
- The UI response is subtle:
  - the pending or new branch chip becomes selected
  - the source assistant reply gets a light targeted state
- The next message sent from the bottom composer becomes the first user turn in that branch.
- When that happens, the previously existing continuation is preserved as `Main`.
- The new branch title starts as a temporary `New branch`, then resolves from the fork prompt when possible, with AI fallback if needed.

### Discoverability across long chats

- Keep chips in the transcript for local switching.
- Add a small top-right branch navigator in peek state.
- Peek state stays lightweight: current path label, maybe branch-point count, nothing noisy.
- Clicking it opens an overlay, not a docked pane.
- The expanded overlay shows only branch points in the current active path.
- Each branch point is identified by a short preview of the assistant reply plus its branch chips.
- Clicking an entry in the overlay scrolls to that fork point; clicking a chip there also switches branch.

### Navigation boundaries

- The left sidebar continues to represent chats only, not branches.
- Inline selection threads remain visually distinct and separate from branch chips.
- V1 does not need a full graph or map surface.
- The design should explicitly leave room for a later optional map view if dense trees outgrow the outline.

### Mobile and smaller screens

- The same model should hold, but the expanded navigator should open as a sheet rather than a tiny floating panel.
- Chips stay inline in the transcript.

## Approved Section 3: Data Model and Persistence

The current codebase already has two useful persistence concepts:

- `conversations` = one saved chat in the sidebar
- `threads` = selection-based inline side discussions

This design keeps those intact and adds a third concept for full-reply branching rather than overloading `threads`.

### Recommended persistence model

1. Keep `threads` only for selection-based inline threads.
2. Add a new `conversation_branches` table for full-reply branch choices.
3. Add a new `previous_message_id` column on `messages` to represent the actual predecessor in a conversation path.
4. Do not reuse the current `parent_message_id` for this. In the current code it is tied to inline-thread behavior, so overloading it would blur two different features.

Illustrative shape:

```sql
create table conversation_branches (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  source_message_id uuid not null references messages(id) on delete cascade,
  entry_message_id uuid not null references messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  is_main boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

And on `messages`:

```sql
alter table messages
  add column previous_message_id uuid references messages(id) on delete set null;
```

### Conceptual model

- An unbranched conversation is a linear message chain via `previous_message_id`.
- When the user forks from an assistant reply, the branch is represented by a new child user message whose `previous_message_id` points to that assistant reply.
- A `conversation_branches` row stores metadata for that branch choice:
  - which assistant reply it branched from
  - which first user message starts that branch
  - its title
  - whether it is the preserved `Main` continuation

The branch record identifies the first user turn of a branch, not every message inside the branch.

### Why this is preferred

If every downstream message is assigned to a branch segment, older-message forking becomes complicated because the system has to split and reassign existing ranges. With a message-tree model:

- the original continuation already exists as the next child in the chain
- creating a new branch just adds another child at the same assistant reply
- nested branching later works naturally without rewriting large chunks of history

The tree lives in `messages`, while branch labels and chip ordering live in `conversation_branches`.

### `Main` branch behavior

- Before branching, a reply has no branch rows.
- When the user creates the first alternate branch from assistant message `A`, the app also materializes the existing continuation from `A` as a `Main` branch row.
- That `Main` row points at the already-existing next user message after `A`.
- The new alternate branch points at the new user message the user is about to send.

This preserves the current transcript as-is until the user actually creates a fork.

### Loading and rendering

For persistent chats:

- load all non-thread messages in the conversation
- load all `conversation_branches` rows for that conversation
- build an in-memory message graph keyed by `previous_message_id`
- render one active path at a time by walking the tree and, at assistant replies with multiple branch options, following the currently selected branch entry

For temporary chats:

- use the same shape in client state
- do not create a separate temporary-only branching model

### Hard boundary with inline threads

- Inline threads continue to use `thread_id` and `threads.source_message_id`.
- Full-reply branches use `conversation_branches` plus `messages.previous_message_id`.
- The two systems can coexist in the same conversation, but they must not share persistence semantics.

### Context isolation requirement

- Branch context must be isolated by path.
- Sibling branches must not be mixed into the active branch context during generation.
- The value of the feature is precisely that different continuations can be explored without contaminating one another.

## Approved Section 4: API and Runtime Behavior

The runtime should treat `active path` as the canonical context, not the whole conversation.

### Prompt assembly

- For any send, the server builds history from the active path only by walking `previous_message_id` backward from the current target point to the root, then reversing it.
- Sibling branches are never included in model context.
- If the user is creating a branch from an older assistant reply, the prompt history ends at that reply, then continues with the new branch message.
- This makes branching useful: each continuation can diverge without inherited noise from alternatives.

### Send flows

Normal reply at current head:

- client sends `conversationId` and `previousMessageId = current path tail`
- server saves the user message with that `previous_message_id`
- assistant reply points to that new user message

First alternate branch from an older assistant reply:

- client sends `conversationId`, `branchSourceMessageId`, and `previousMessageId = branchSourceMessageId`
- server materializes `Main` for the existing continuation if needed
- server creates the new user message as the branch entry
- server creates a `conversation_branches` row pointing to that entry message
- assistant reply continues from that new user message

Continue an existing branch:

- client sends `conversationId`, `branchId`, and `previousMessageId = current branch tail`
- server appends to that branch path only

### Client state

- The client keeps a branch-selection map for the open conversation, keyed by `source_message_id`.
- Switching chips updates that local selection map and re-renders the active path immediately.
- Branch switching should not require a round trip.
- The composer always targets the currently active path, unless the user has just clicked `+ Branch`, in which case the next send targets the pending new branch from that specific assistant reply.

### Loading behavior

- When a conversation opens, load all non-thread messages plus all `conversation_branches`.
- Build the message graph client-side.
- Derive the visible transcript from the current branch-selection map.
- Inline selection threads continue to load through the existing `threads` path and stay separate from branch rendering.

### Memory and isolation

- Stable user facts, preferences, and real commitments can still enter long-term memory.
- Branch-local speculation, assistant-generated ideas, and abandoned exploratory paths should not be treated as shared branch context.
- The memory pipeline should become branch-aware enough to preserve provenance, so speculative content from one branch is not later injected as if it were canonical in sibling branches.
- The strict invariant is: `active branch transcript is isolated by path`, even if global user memory still exists.

## Approved Section 5: Failure Modes and Guardrails

Given the memory decision, the system needs explicit guardrails so branching stays useful instead of messy.

### Primary failure modes

- `Context bleed`
  - A reply in branch `B` accidentally includes sibling-branch context from branch `A`.
  - Guardrail: prompt history is always reconstructed from the active path only.

- `Memory pollution`
  - Speculative or model-generated ideas from exploratory branches get written into long-term memory as if they were true.
  - Guardrail: branch memory extraction is limited to user-stated facts and commitments only.

- `Branch confusion in UI`
  - The user loses track of which continuation they are viewing after switching chips.
  - Guardrail: the active chip is always visually distinct, and the top-right navigator reflects the current path without taking over the layout.

- `Accidental branch creation`
  - The user means to continue normally but sends into a newly armed branch by mistake.
  - Guardrail: `+ Branch` must create a visible selected pending chip, and the user can deselect or cancel it before sending.

- `History corruption`
  - The first alternate branch rewrites or hides the original continuation incorrectly.
  - Guardrail: the pre-existing continuation is materialized as `Main` and never destroyed when a new sibling branch is created.

- `Overgrown tree`
  - A long conversation accumulates too many branch points for chip-only navigation to stay usable.
  - Guardrail: v1 includes the lightweight branch navigator, and the data model leaves room for a later optional map view.

### Memory-specific rules

- Memory extraction may run for all branches.
- The extractor should only consider:
  - user-stated facts
  - user-stated preferences
  - user-stated constraints
  - user commitments or decisions clearly made by the user
- The extractor should ignore:
  - assistant suggestions
  - hypothetical branch exploration
  - unadopted options
  - speculative conclusions not clearly owned by the user

## Related Specs

- [Conversation Tree Testing Strategy](./2026-04-11-conversation-tree-testing.md)
- [Conversation Tree Map View](./2026-04-11-conversation-tree-map-view.md)

## Scope Boundary

- V1 is transcript-native and does not include a full map surface.
- A future optional map view is documented separately so the data model and UI decisions leave room for it without forcing it into the first implementation.

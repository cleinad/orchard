# Conversation Branching

## What This Doc Covers

This doc describes transcript-native conversation branching on `/home`.

It covers:

- how full-reply branches differ from inline threads
- how branch creation and branch switching work in the transcript
- how the conversation map works across desktop and mobile
- how branch state is represented in client state and persisted data
- which runtime invariants must hold to avoid context bleed and UI confusion

This is the current source of truth for the shipped branching feature. Use the dated spec files only for historical rationale and future scope.

## Overview

Conversation branching turns one chat into a tree-shaped workspace while keeping the reading experience linear.

Core model:

- the sidebar still shows one chat item per conversation
- branches live inside a chat, not as separate sidebar entries
- only assistant replies can become branch points
- the user creates branches explicitly with `+ Branch`
- the transcript always shows one active path at a time
- switching a branch changes only the transcript below that fork point

This is intentionally different from inline threads.

- **Conversation branch**
  - alternate continuation from a full assistant reply
  - becomes part of the main conversation tree
  - affects prompt assembly for future top-level replies
- **Inline thread**
  - side discussion anchored to a selected text span
  - remains a separate learning-mode interaction
  - does not replace the active top-level conversation path

## User-Facing Behavior

### Branch creation

The user creates a branch from an assistant reply by clicking `+ Branch`.

Behavior:

- clicking `+ Branch` arms a pending branch target from that assistant reply
- the bottom composer stays in place
- the source reply gets a subtle targeted state
- a pending branch chip appears selected
- the next submitted message becomes the first user turn in that branch

On the first real fork from an assistant reply:

- the existing continuation is preserved as `Main`
- the new branch is created as a sibling continuation
- the new branch title is derived from the first branch prompt, with `New branch` as fallback

Current limitation:

- branch titles are auto-generated from the branch prompt
- branch rename UI is not implemented yet

### Branch switching in the transcript

Assistant replies with alternate continuations show branch chips directly under the message.

Rules:

- chips only render on assistant replies that actually have branches
- the active chip is visually distinct
- clicking a chip swaps the transcript after that reply to the selected branch
- content above that reply does not change
- older assistant replies can be forked later, not just the current head

### Conversation map

Longer conversations expose a `Map` control in the top-right of the chat pane.

Availability:

- appears only when the selected conversation has at least one real branch point
- stays available while the transcript scrolls
- keeps per-conversation camera position and pane width in local state

Desktop behavior:

- opens as a split pane beside the transcript
- the divider can be resized horizontally
- the map renders the full conversation tree, not just the current active path
- turn depth stays vertically stable while horizontal spacing adapts to subtree growth
- sibling branches spread symmetrically around the main route instead of reusing rigid fixed columns
- connector lines are softly diagonal or curved so the tree can expand without stacked right-angle elbows
- each visible node is one merged turn card that combines the user prompt and assistant reply
- prompt context stays visible in the card, while the assistant preview remains the dominant content
- branch titles are not shown in the map UI
- zoom changes scale only; it does not collapse turns into summary placeholders
- the current transcript position is highlighted while scrolling

Mobile behavior:

- opens as a full-screen takeover
- closes after route navigation so focus returns to the transcript

Navigation behavior:

- clicking any node activates the full route needed to reach that message
- route activation updates all fork selections between the root and the target node
- after activation, the transcript scrolls to the corresponding turn in the transcript
- desktop hover and keyboard focus show a local floating preview beside the node
- the preview closes as soon as the pointer leaves the node
- the floating preview renders markdown visually but is not an interactive reading surface
- the map and inline-thread panel are mutually exclusive surfaces
- opening inline-thread UI closes the map to avoid overlapping navigation surfaces

### Sidebar and navigation boundaries

Branching does not change the sidebar mental model.

Rules:

- a conversation tree is still one chat in the sidebar
- branches do not appear as nested sidebar items
- branch switching happens inside the conversation UI
- inline threads remain visually and behaviorally separate from branches

### Persistent, draft, and temporary chats

The same branching model works across all home chat types.

- **Persistent conversations**
  - branches are loaded from and saved to Supabase
- **Local drafts**
  - branches exist in local state until the first successful send promotes the draft
- **Temporary chats**
  - branches exist only in session-local state and are never persisted

## Runtime Model

### Active path projection

The client stores the full message tree for the selected chat, then projects one active path at a time.

Key concepts:

- `selectedBranchIds`
  - map keyed by assistant `source_message_id`
  - determines which branch is active at each fork point
- `pendingBranch`
  - temporary branch target created by `+ Branch`
  - makes the next send go to a new continuation from a specific assistant reply
- `activeMessages`
  - one visible transcript path derived from the message tree plus `selectedBranchIds`

The canonical tree helpers live in `frontend/app/home/components/conversationTree.ts` and `frontend/app/home/components/conversationMapModel.ts`.

### Prompt and response isolation

Branching is only useful if context is isolated by path.

Required invariants:

- prompt history for top-level replies is built from the active path only
- sibling branches must never be included in model context
- the loading or thinking indicator must only appear for the branch or chat that owns the in-flight request
- late responses must not overwrite whichever branch or chat the user navigated to afterward

The home page now scopes pending request state to the originating branch/chat instead of using one global loading flag.

### Persistence model

Full-reply branches are intentionally separate from inline threads.

Top-level path structure:

- `messages.previous_message_id`
  - records the actual predecessor in the top-level conversation tree
- `conversation_branches`
  - stores branch metadata for each fork choice
  - `source_message_id` = assistant reply being forked from
  - `entry_message_id` = first user message in that branch
  - `is_main` = preserved original continuation
  - `position` = chip ordering for siblings

Important boundary:

- inline threads still use `threads` plus thread-scoped `messages.parent_message_id`
- full-reply branches use `conversation_branches` plus `messages.previous_message_id`
- these systems must not be merged semantically

### First-fork materialization

Before branching, a normal linear conversation does not need explicit branch rows.

When the first alternate branch is created from assistant reply `A`:

- the existing continuation from `A` is materialized as `Main` if needed
- the new branch points at the new user message being created
- future top-level replies continue down the selected branch path

## Memory Guardrails

Branch exploration should not poison long-term memory.

Current behavior:

- memory extraction can still run after branched conversations
- extraction is limited to user-stated facts, preferences, constraints, decisions, and commitments
- assistant-generated ideas and speculative branch exploration should not be stored unless the user clearly adopts them

## Key Files

| File | Role |
|------|------|
| `frontend/app/home/[[...conversationId]]/page.tsx` | Home-screen orchestration for branch state, active path projection, map layout, transcript sync, and branch-scoped loading |
| `frontend/app/home/components/conversationTree.ts` | Canonical tree helpers for transcript path projection, chip derivation, and optimistic branch creation |
| `frontend/app/home/components/conversationMapModel.ts` | Pure conversation-tree projection for merged turn cards, edges, active-path state, and route selection patches |
| `frontend/app/home/components/ConversationMap.tsx` | Hybrid SVG + HTML renderer for the tree, pan/zoom camera, local hover preview, and node selection UI |
| `frontend/app/home/components/ConversationMapToggle.tsx` | Home header entry point for opening the map |
| `frontend/app/home/components/useConversationMapState.ts` | Per-conversation map open state, split ratio, and camera persistence |
| `frontend/app/home/components/ConversationView.tsx` | Transcript rendering, branch chip UI, and pending branch highlighting |
| `frontend/app/home/components/useHomeData.ts` | Loads `previous_message_id` and `conversation_branches` for persistent conversations |
| `frontend/app/api/chat/route.ts` | Branch-aware request handling, `Main` materialization, branch row creation, and active-path prompt assembly |
| `frontend/lib/memory-agent.ts` | Memory extraction rules that avoid storing speculative branch exploration as facts |
| `supabase/migrations/20260412043830_conversation_branches.sql` | Schema changes for `messages.previous_message_id` and `conversation_branches` |

## Database Impact

Branching added a dedicated migration:

- [`20260412043830_conversation_branches.sql`](../../supabase/migrations/20260412043830_conversation_branches.sql)

That migration:

- adds `messages.previous_message_id`
- creates `conversation_branches`
- adds indexes for branch loading
- adds RLS policies for branch metadata
- backfills `previous_message_id` for existing top-level message history

## Intentional Limits

These are current limits, not bugs:

- branch rename UI is not implemented yet
- branches do not appear in the sidebar
- the map is navigation-only and does not support branch rename or editing flows
- branch titles remain internal metadata and are not surfaced in the map UI
- the map closes when inline-thread UI opens instead of coexisting side by side

## Historical References

Use these for intent and future scope, not as the primary behavior source:

- [`docs/superpowers/specs/2026-04-11-conversation-tree-design.md`](../superpowers/specs/2026-04-11-conversation-tree-design.md)
- [`docs/superpowers/specs/2026-04-11-conversation-tree-testing.md`](../superpowers/specs/2026-04-11-conversation-tree-testing.md)
- [`docs/superpowers/specs/2026-04-11-conversation-tree-map-view.md`](../superpowers/specs/2026-04-11-conversation-tree-map-view.md)
- [`docs/superpowers/specs/2026-04-15-conversation-map-split-pane-design.md`](../superpowers/specs/2026-04-15-conversation-map-split-pane-design.md)

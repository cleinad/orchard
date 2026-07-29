# Product

Orchard is a conversational learning tool for people who want to understand
anything: students, researchers, professionals, and curious people learning on
their own.

## Core experience

Chat is the primary interface. Orchard's defining interactions make it easier
to follow questions without losing the original explanation:

- **Inline threads:** highlight part of a response and ask a focused follow-up
  in a side conversation. The main chat remains unchanged.
- **Conversation branches:** start an alternate path from an earlier response
  and switch between paths without mixing their context.

These interactions are useful when reading code, working through a technical
explanation, studying a subject, comparing interpretations, or following a
small point that does not deserve a separate chat.

## Supporting concepts

- A **chat** is the main persistent conversation.
- A **temporary chat** is kept only for the current browser session and is not
  written to the application database.
- A **workspace** groups chats around a subject and adds shared instructions.
- **Live search** optionally grounds a response in current external sources.

The supporting features should make learning more convenient, but they are not
the product's identity. Inline threads and branching are the interactions that
Orchard should make unusually good.

## Product principles

- **Keep the learner's place.** Exploring a detail should not destroy the main
  line of thought.
- **Separate context deliberately.** Threads and branches should use only the
  context that belongs to their path.
- **Make depth convenient.** Asking one more question should require less
  organizational work than opening and managing another chat.
- **Show structure without demanding maintenance.** The interface should reveal
  how ideas relate without turning learning into note management.
- **Ground answers when requested.** Search and sources should be available when
  freshness or external evidence matters.
- **Stay calm and readable.** The interface should favor the material being
  learned over product chrome.

## Current boundaries

Orchard is not an autonomous agent or a general task-automation system. It does
not act on external services on the user's behalf. Plans for future work belong
in the [backlog](./backlog.md), not in this description of the current product.

## Related docs

- [Inline threads](./features/inline-threads.md)
- [Conversation branching](./features/conversation-branching.md)
- [Architecture](./architecture.md)

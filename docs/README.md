# Docs

This directory is the central documentation entrypoint for Keen.

Start here if you need to understand what the app is, how the product is organized, and which docs are the current source of truth for behavior, architecture, testing, and implementation constraints.

## What Keen Is

Keen is a chat-first workspace for research and exploration centered on:

- ongoing conversations around a subject
- multi-chat navigation for returning to previous investigations
- transcript-native conversation branching inside a chat
- live web search for current or external information
- continuity across conversations so users can build understanding over time

Additional product surfaces like inline threads, temporary chats, and mentors build on top of that core model.

## How To Use These Docs

Use the docs in this order:

1. Read [outline.md](./outline.md) for product vision, workspace model, principles, and MVP scope.
2. Read [architecture.md](./architecture.md) for the system overview and major technical building blocks.
3. Read the relevant file in [features](./features/) for the current product behavior of a specific area.
4. Read [implementation](./implementation/) docs when a feature has non-obvious engineering invariants.
5. Read [testing/README.md](./testing/README.md) before changing sensitive behavior, then follow the linked suite docs.
6. Use [plans](./plans/) and [superpowers](./superpowers/) for historical rationale, not as the primary source of truth.

If docs conflict, prefer:

1. `docs/features/`
2. `docs/implementation/`
3. current code
4. dated plans/specs

## Core Docs

- [outline.md](./outline.md): product vision, user problems, core concepts, principles, MVP scope, and roadmap
- [architecture.md](./architecture.md): technical architecture, data flow, and system model
- [design-language.md](./design-language.md): visual philosophy, typography rules, composition guidance, and UI constraints for future frontend work

## Feature Reference

- [features/auth-and-route-protection.md](./features/auth-and-route-protection.md): auth model, protected routes including `/home/[conversationId]`, proxy rules, and testing coverage
- [features/chat-model-selection.md](./features/chat-model-selection.md): model picker behavior across routed home chats, resolution rules, availability rules, and verification
- [features/conversation-branching.md](./features/conversation-branching.md): branch chips, branch navigator, tree state, persistence model, and runtime isolation rules
- [features/inline-threads.md](./features/inline-threads.md): text selection, popover behavior, thread panel rules, keyboard behavior, and edge cases across `/home` and `/home/[conversationId]`
- [features/live-search.md](./features/live-search.md): live web search behavior, execution flow, routed home-surface integration, and safety constraints
- [features/memory.md](./features/memory.md): memory system architecture, read/write paths, schema, and API shape
- [features/mentors.md](./features/mentors.md): built-in and custom mentors, data model, prompt construction, and API integration
- [features/multi-chat-home.md](./features/multi-chat-home.md): multi-conversation home behavior, persistent conversation URLs, route hydration, sidebar model, runtime state, and database impact
- [features/temporary-chat.md](./features/temporary-chat.md): temporary chat behavior, memory modes, URL-less `/home` behavior, and chat route behavior

## Implementation Notes

- [implementation/inline-thread-rendering.md](./implementation/inline-thread-rendering.md): durable inline-thread rendering rules and renderer invariants

Use implementation docs when the feature doc tells you what should happen, but the engineering mechanics are easy to break during refactors.

## Testing Docs

- [testing/README.md](./testing/README.md): central test map, runner commands, focused canaries, and test inventory
- [testing/home-routing-e2e.md](./testing/home-routing-e2e.md): routed home-chat browser coverage, mocks, and regression targets
- [testing/inline-threads-e2e.md](./testing/inline-threads-e2e.md): inline-thread end-to-end coverage, fixtures, and regression cases
- [testing/search-citations-and-source-ui.md](./testing/search-citations-and-source-ui.md): live-search citation coverage, focused canary, manual checks, and current gaps
- [tests/chat-model-selection-tests.md](./tests/chat-model-selection-tests.md): automated and manual verification for model selection
- [tests/memory-tests.md](./tests/memory-tests.md): memory test suite map, coverage philosophy, and remaining gaps
- [features/auth-and-route-protection.md](./features/auth-and-route-protection.md): auth and route-protection testing coverage plus focused command

## SQL Reference

- [sql/supabase_schema.sql](./sql/supabase_schema.sql): general schema reference
- [sql/supabase_memory.sql](./sql/supabase_memory.sql): memory-related schema
- [sql/supabase_chat_messages.sql](./sql/supabase_chat_messages.sql): chat message schema reference
- [sql/threads_migration.sql](./sql/threads_migration.sql): thread-related migration reference

## Historical Design And Planning

- [plans](./plans/): dated product design docs, specs, bug writeups, and implementation plans
- [superpowers](./superpowers/): worker-oriented specs and implementation plans from earlier agent workflows

These are useful for intent, tradeoffs, and historical context, but they should not override current feature docs or current code.

## For Coding Agents

If you are making changes in this repo:

- start from this file
- read [design-language.md](./design-language.md) before changing the landing page, auth pages, or any major visual surface
- use `docs/features/` as the default behavior reference
- read [features/conversation-branching.md](./features/conversation-branching.md) before changing `messages.previous_message_id`, `conversation_branches`, branch chips, or the top-right branch navigator
- check `docs/implementation/` before refactoring sensitive rendering or state logic
- check test docs before changing memory, model selection, auth, or inline-thread behavior
- treat dated plan/spec files as context, not authority
- update the relevant feature or testing doc when you change user-visible behavior or important invariants

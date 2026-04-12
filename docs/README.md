# Docs

This directory is the central documentation entrypoint for Keen.

Start here if you need to understand what the app is, how the product is organized, and which docs are the current source of truth for behavior, architecture, testing, and implementation constraints.

## What Keen Is

Keen is a voice-native AI thinking partner with:

- persistent memory
- specialized mentors
- live web search
- multi-conversation chat on the home surface
- temporary chats for low-commitment exploration
- inline threads for branching into focused side discussions

At a high level, the product combines a chat interface, memory system, mentor personas, and optional voice/search capabilities.

## How To Use These Docs

Use the docs in this order:

1. Read [outline.md](./outline.md) for product vision, core concepts, and scope.
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

- [outline.md](./outline.md): product vision, user problems, modes, principles, and MVP scope
- [architecture.md](./architecture.md): technical architecture, data flow, and system model

## Feature Reference

- [features/auth-and-route-protection.md](./features/auth-and-route-protection.md): auth model, protected routes, proxy rules, and testing coverage
- [features/chat-model-selection.md](./features/chat-model-selection.md): model picker behavior, resolution rules, availability rules, and verification
- [features/inline-threads.md](./features/inline-threads.md): text selection, popover behavior, thread panel rules, keyboard behavior, and edge cases
- [features/live-search.md](./features/live-search.md): live web search behavior, execution flow, and safety constraints
- [features/memory.md](./features/memory.md): memory system architecture, read/write paths, schema, and API shape
- [features/mentors.md](./features/mentors.md): built-in and custom mentors, data model, prompt construction, and API integration
- [features/multi-chat-home.md](./features/multi-chat-home.md): multi-conversation home behavior, sidebar model, runtime state, and database impact
- [features/temporary-chat.md](./features/temporary-chat.md): temporary chat behavior, memory modes, and chat route behavior

## Implementation Notes

- [implementation/inline-thread-rendering.md](./implementation/inline-thread-rendering.md): durable inline-thread rendering rules and renderer invariants

Use implementation docs when the feature doc tells you what should happen, but the engineering mechanics are easy to break during refactors.

## Testing Docs

- [testing/README.md](./testing/README.md): central test map, runner commands, focused canaries, and test inventory
- [testing/inline-threads-e2e.md](./testing/inline-threads-e2e.md): inline-thread end-to-end coverage, fixtures, and regression cases
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
- use `docs/features/` as the default behavior reference
- check `docs/implementation/` before refactoring sensitive rendering or state logic
- check test docs before changing memory, model selection, auth, or inline-thread behavior
- treat dated plan/spec files as context, not authority
- update the relevant feature or testing doc when you change user-visible behavior or important invariants

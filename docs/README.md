# Docs

This directory is the central documentation entrypoint for Keen.

Start here if you need to understand what the app is, how the product is organized, and which docs are the current source of truth for behavior, architecture, testing, and implementation constraints.

## What Keen Is

Keen is a chat-first workspace for research and exploration centered on:

- ongoing conversations around a subject
- multi-chat navigation for returning to previous investigations
- transcript-native conversation branching inside a chat
- explicit search mode for current or external information
- continuity across conversations so users can build understanding over time

Additional product surfaces like inline threads, temporary chats, and mentors build on top of that core model.

## How To Use These Docs

Use the docs in this order:

1. Read [outline.md](./outline.md) for product vision, workspace model, principles, and MVP scope.
2. Read [architecture.md](./architecture.md) for the system overview and major technical building blocks.
3. Read the relevant file in [features](./features/) for the current product behavior of a specific area.
4. Read [implementation](./implementation/) docs when a feature has non-obvious engineering invariants.
5. Read [testing/README.md](./testing/README.md) before changing sensitive behavior, then follow the linked suite docs.

If docs conflict, prefer:

1. `docs/features/`
2. `docs/implementation/`
3. current code

## Core Docs

- [outline.md](./outline.md): product vision, user problems, core concepts, principles, MVP scope, and roadmap
- [architecture.md](./architecture.md): technical architecture, data flow, and system model
- [design/design-language.md](./design/design-language.md): visual philosophy, typography rules, composition guidance, and UI constraints for future frontend work
- [design/tokens.md](./design/tokens.md): CSS variables and Tailwind design tokens used in the frontend (typography, color, themes)

## Feature Reference

- [features/auth-and-route-protection.md](./features/auth-and-route-protection.md): auth model, protected routes including `/home/[conversationId]`, proxy rules, and testing coverage
- [features/chat-model-selection.md](./features/chat-model-selection.md): model picker behavior across routed home chats, resolution rules, availability rules, and verification
- [features/conversation-branching.md](./features/conversation-branching.md): branch chips, conversation map, tree state, persistence model, and runtime isolation rules
- [features/image-attachments.md](./features/image-attachments.md): image paste/drop/upload behavior, Supabase Storage flow, model-native vision handling, validation, and cleanup boundaries
- [features/inline-threads.md](./features/inline-threads.md): text selection, popover behavior, thread panel rules, keyboard behavior, and edge cases across `/home` and `/home/[conversationId]`
- [features/live-search.md](./features/live-search.md): explicit search-mode behavior, provider-backed retrieval pipeline, persisted source metadata, and safety constraints
- [features/memory.md](./features/memory.md): memory system architecture, read/write paths, schema, and API shape
- [features/mentors.md](./features/mentors.md): built-in and custom mentors, data model, prompt construction, and API integration
- [features/multi-chat-home.md](./features/multi-chat-home.md): multi-conversation home behavior, persistent conversation URLs, route hydration including the routed-history loading placeholder, non-persistent handoff back to `/home`, sidebar model, runtime state, and database impact
- [features/temporary-chat.md](./features/temporary-chat.md): temporary chat behavior, memory modes, URL-less `/home` behavior, first-click handoff from routed conversations, and chat route behavior

## Current Search Status

Search mode has shipped its first provider-backed slice:

- explicit-only search toggle
- deterministic internal routing with no extra model hop
- `Brave + Exa` retrieval pipeline
- persisted v2 source metadata with a larger reply-attached source tray
- structured server-side search telemetry for route, provider, and pipeline events

Still left to do:

- validate and tune the live provider stack with real `BRAVE_API_KEY` and `EXA_API_KEY`
- add caching and durable telemetry only if structured server logs stop being enough
- add `X`-backed retrieval for explicit reaction or sentiment queries
- revisit storage only if message-level `search_metadata` becomes too limiting

See [features/live-search.md](./features/live-search.md) for the current search behavior and the active follow-up list.

## Implementation Notes

- [implementation/inline-thread-rendering.md](./implementation/inline-thread-rendering.md): durable inline-thread rendering rules and renderer invariants

Use implementation docs when the feature doc tells you what should happen, but the engineering mechanics are easy to break during refactors.

## Testing Docs

- [testing/README.md](./testing/README.md): central test map, runner commands, focused canaries, and test inventory
- [testing/home-routing-e2e.md](./testing/home-routing-e2e.md): routed home-chat browser coverage, mocks, and regression targets including delayed `/home/[conversationId]` hydration and `/home/[conversationId]` to `/home` draft/temporary transitions
- [testing/inline-threads-e2e.md](./testing/inline-threads-e2e.md): inline-thread end-to-end coverage, fixtures, and regression cases
- [testing/search-citations-and-source-ui.md](./testing/search-citations-and-source-ui.md): search-mode citation coverage, focused canary, manual checks, and current gaps
- [testing/search-tuning-playbook.md](./testing/search-tuning-playbook.md): manual live-provider validation, telemetry review, and search-quality tuning workflow
- [testing/chat-model-selection.md](./testing/chat-model-selection.md): automated and manual verification for model selection
- [testing/memory.md](./testing/memory.md): memory test suite map, coverage philosophy, and remaining gaps
- [features/auth-and-route-protection.md](./features/auth-and-route-protection.md): auth and route-protection testing coverage plus focused command

## Database Reference

Supabase migrations in [`supabase/migrations`](../supabase/migrations/) are the database source of truth.

Feature docs describe the current product-facing schema impact:

- [features/memory.md](./features/memory.md): memory tables and retrieval/write paths
- [features/multi-chat-home.md](./features/multi-chat-home.md): conversation and sidebar persistence model
- [features/conversation-branching.md](./features/conversation-branching.md): branch metadata and `messages.previous_message_id`
- [features/inline-threads.md](./features/inline-threads.md): thread persistence model

## For Coding Agents

If you are making changes in this repo:

- start from this file
- read [design/design-language.md](./design/design-language.md) and [design/tokens.md](./design/tokens.md) before changing the landing page, auth pages, typography tokens, or any major visual surface
- use `docs/features/` as the default behavior reference
- read [features/multi-chat-home.md](./features/multi-chat-home.md) before changing `/home` route hydration, draft/temporary selection, or handoff from `/home/[conversationId]` back to `/home`
- read [features/conversation-branching.md](./features/conversation-branching.md) before changing `messages.previous_message_id`, `conversation_branches`, branch chips, or conversation-map routing/state
- check `docs/implementation/` before refactoring sensitive rendering or state logic
- check test docs before changing memory, model selection, auth, or inline-thread behavior
- update the relevant feature or testing doc when you change user-visible behavior or important invariants

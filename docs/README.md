# Orchard Documentation

This is the map for Orchard's current product and implementation
documentation. Product and feature documents describe shipped behavior.
Unshipped work belongs in the [backlog](./backlog.md).

## Understand Orchard

- [Product](./product.md) — purpose, defining interactions, vocabulary, and
  product principles
- [Architecture](./architecture.md) — runtime, persistence, providers, and
  request flows
- [Backlog](./backlog.md) — bugs, improvements, feature ideas, and long-term
  directions

## Understand a feature

### Core learning interactions

- [Inline threads](./features/inline-threads.md) — highlight a passage and open
  a focused side conversation
- [Conversation branching](./features/conversation-branching.md) — create and
  navigate alternate paths inside a chat
- [Inline-thread rendering](./implementation/inline-thread-rendering.md) —
  selection offsets, markdown structure, and highlight invariants

### Chats and organization

- [Multi-chat home](./features/multi-chat-home.md) — persistent chats, drafts,
  routing, and sidebar behavior
- [Temporary chats](./features/temporary-chat.md) — session-only chat behavior
  and privacy boundaries
- [Chat run lifecycle](./features/chat-run-lifecycle.md) — execution,
  cancellation, persistence, and recovery
- [Workspaces](./features/workspaces.md) — grouped chats, shared instructions,
  moves, and deletion

### Chat capabilities

- [Model selection](./features/chat-model-selection.md) — configured providers,
  Auto resolution, effort, and thinking controls
- [Response style](./features/response-style.md) — per-chat answer length,
  assumed knowledge, and custom guidance
- [Live search](./features/live-search.md) — search modes, retrieval, citations,
  and failure behavior
- [Image attachments](./features/image-attachments.md) — upload, storage,
  validation, and model context
- [Authentication](./features/auth-and-route-protection.md) — public and
  protected routes, session handling, and API authorization

## Develop and verify Orchard

- [Local setup](./development/setup.md) — dependencies, environment variables,
  Supabase expectations, and startup
- [Testing](./testing/README.md) — Vitest, Playwright, focused checks, and test
  locations
- [Search tuning](./testing/search-tuning-playbook.md) — manual live-provider
  evaluation
- [Design language](./design/design-language.md) — visual and interaction
  principles
- [Design tokens](./design/tokens.md) — implemented typography, colors, themes,
  and surfaces

## Source-of-truth rules

- Current behavior: implementation plus the closest feature document
- Database shape: active files in `supabase/migrations/`
- Visual rules: `docs/design/`
- Unshipped work: `docs/backlog.md`
- Substantial active implementation plans: `docs/plans/`

If implementation and documentation disagree, verify the behavior before
changing either. A code path's presence does not by itself mean the capability
is enabled or shipped.

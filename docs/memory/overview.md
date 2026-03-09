# Memory System Overview

Novus has a persistent memory system that lets the AI remember facts about the user across conversations. Memory is stored as structured markdown files in Supabase, written by an LLM-powered agent after each conversation, and injected into the system prompt at chat time.

## High-Level Architecture

```
User sends message
        |
        v
  Chat API (route.ts)
        |
        +---> loadMemoryContext() ---> reads memory files ---> injects into system prompt
        |
        v
  LLM generates response
        |
        v
  after() callback
        |
        v
  processMemory() ---> Memory Agent (LLM with tools) ---> reads/writes memory files
```

Memory flows through two paths:

1. **Read path** — at chat time, existing memories are loaded and injected into the system prompt so the LLM can reference them naturally.
2. **Write path** — after the response is sent, a background agent analyzes the conversation and updates memory files when new information is revealed.

## File Locations

| File | Purpose |
|------|---------|
| `lib/memory-types.ts` | Types, categories, constants |
| `lib/memory-entries.ts` | Parse/serialize functions for both file formats |
| `lib/memory-reader.ts` | Read path — loads memory into system prompt context |
| `lib/memory-agent.ts` | Write path — LLM agent that updates memory files |
| `app/api/memory/route.ts` | REST API for the memory UI (edit/delete entries) |
| `app/home/components/useMemory.ts` | React hook for loading and managing memories |
| `app/home/components/MemoryPanel.tsx` | Slide-out panel displaying all memories |
| `app/home/components/MemoryEntry.tsx` | Individual memory entry component (view/edit/delete) |

## Key Design Decisions

- **File-based metaphor**: Memory is organized as virtual markdown files (not individual rows per fact). This gives the memory agent a natural document to read, merge, and rewrite.
- **Two memory types**: Long-term files hold curated facts; daily files are append-only journals. This separates stable knowledge from transient context.
- **Background processing**: Memory updates happen in a `next/server` `after()` callback, so they never block the chat response.
- **Mentor conversations skip memory**: Only Novus (the default assistant) conversations trigger memory updates. Mentor conversations do not write to memory in v1.
- **Optimistic UI**: The memory panel uses optimistic updates with rollback on failure.

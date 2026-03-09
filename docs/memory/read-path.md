# Memory Read Path

The read path loads stored memories and injects them into the LLM's system prompt so it can reference what it knows about the user.

## Loading Memory

`lib/memory-reader.ts` exports `loadMemoryContext(supabase, userId)` which:

1. **Loads all long-term files** — queries `memory_files` where `category != 'daily'` and content is non-empty
2. **Loads recent daily files** — queries `memory_files` where `category = 'daily'` and `file_path >= 'daily/<3-days-ago>.md'` (lexicographic comparison on ISO date paths)
3. **Formats into markdown** — long-term files are grouped by category with headings; daily files are grouped by date under "Recent Context"

### Output Format

```markdown
## About the User
- Daniel | 25, lives in SF | 2026-02-12

## Interests
- rock climbing | goes to the gym 3x/week | 2026-02-12

## Recent Context (Daily Notes)
### 2026-02-14
- discussed project timeline with Sarah
- decided to push launch to March

### 2026-02-13
- mentioned being stressed about deadline
```

## Injection into System Prompt

In `app/api/chat/route.ts`, the memory context is injected into the system prompt:

```ts
const systemPrompt = buildSystemPrompt(await loadMemoryContext(supabase, user.id));
```

The `buildSystemPrompt` function wraps it in `<user_memory>` tags:

```
You have memory about this user from previous conversations. Use it naturally —
reference what you know as if you simply remember. Never announce that you are
reading from memory or mention your memory system.

<user_memory>
...memory context here...
</user_memory>
```

## Data Windows

| Memory type | Window | Rationale |
|-------------|--------|-----------|
| Long-term | All files | Stable facts — always relevant |
| Daily (read path) | Last 3 days | Recent context without bloating the prompt |
| Daily (UI panel) | Last 7 days | Users may want to review slightly older notes |

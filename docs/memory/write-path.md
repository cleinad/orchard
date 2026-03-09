# Memory Write Path

The write path is how new information gets into memory. It runs as a background process after each Novus conversation.

## Trigger

In `app/api/chat/route.ts`, after the LLM response is generated and sent:

```ts
if (!isMentorConversation) {
  after(async () => {
    await processMemory(user.id, messages, assistantResponse);
  });
}
```

`after()` from `next/server` runs the callback after the response is sent to the client, so memory processing never adds latency to the chat.

## The Memory Agent

`lib/memory-agent.ts` implements an LLM-powered agent that decides what to remember.

### Model

Uses `MEMORY_MODEL` (currently Claude Haiku 4.5) — fast and cheap for a background task.

### Input

The agent receives the last 5 conversation messages plus the latest assistant response, formatted as:

```
user: ...
assistant: ...
user: ...
assistant: ...
```

### Tools

The agent has three tools to interact with memory files:

| Tool | Purpose | When to use |
|------|---------|-------------|
| `read_memory_file` | Read current file content | Always before writing — prevents data loss |
| `write_memory_file` | Overwrite a file entirely | Long-term files — merge existing + new entries |
| `append_to_memory_file` | Append to end of file | Daily files — add new bullet points |

### Execution

Uses Vercel AI SDK's `generateText` with tool use in an agentic loop:

1. Agent analyzes the conversation
2. If nothing noteworthy, it stops (no tool calls)
3. If new info found, it reads relevant files, then writes/appends updates
4. Loop stops after max 10 steps (`stopWhen: stepCountIs(10)`)

### Agent Rules

The system prompt instructs the agent to:

1. Only update when genuinely NEW, noteworthy information is revealed
2. Skip conversation mechanics, pleasantries, meta-discussion
3. Store facts, preferences, decisions, commitments, emotional states
4. Always READ before WRITE to avoid clobbering
5. Merge new entries with existing ones for long-term files
6. Append to daily files
7. Keep entries concise (single line each)
8. Do nothing if nothing noteworthy was said

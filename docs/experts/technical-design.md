# Experts - Technical Design

Reference: [overview.md](./overview.md) for product context, [personas.md](./personas.md) for the 12 built-in experts.

---

## Current State

Relevant existing infrastructure:

- **Chat route**: `frontend/app/api/chat/route.ts` — takes `{ message, conversationId }`, builds a system prompt, calls LLM via Vercel AI SDK `generateText()`, saves messages to DB
- **System prompt**: `BASE_SYSTEM_PROMPT` is a hardcoded string constant for Novus. `buildSystemPrompt()` appends memory context if available.
- **Models**: `frontend/lib/models.ts` — `CHAT_MODEL` (Gemini Flash) and `MEMORY_MODEL` (Claude Haiku). Single model for all conversations.
- **Memory**: `memory-reader.ts` loads long-term + daily memory files from `memory_files` table. `memory-agent.ts` runs in background after each response to update memory.
- **DB tables**: `profiles`, `conversations`, `messages`, `threads`, `items`, `memory_files`. Conversations belong to a user. Messages belong to a conversation.

---

## Data Model

### New table: `experts`

Stores both built-in and user-created experts. Each user gets their own copy of built-in experts (seeded on signup) so they can customize without affecting others.

```sql
create table experts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  -- Identity
  slug text not null,              -- e.g. 'the-chef', 'the-interviewer'
  name text not null,              -- e.g. 'The Chef'
  tagline text not null,           -- e.g. 'Knows what to do with whatever's in your fridge.'
  description text,                -- longer description shown on detail view

  -- Prompt
  base_system_prompt text not null, -- locked for built-ins, full control for custom
  user_instructions text default '', -- user's additions, appended at runtime

  -- Metadata
  is_builtin boolean default false, -- true for seeded defaults, false for user-created
  accent_color text,                -- hex color for UI accent (e.g. '#E85D3A')
  avatar_url text,                  -- optional avatar image
  voice_id text,                    -- TTS voice identifier (nullable, falls back to default)
  model_id text,                    -- LLM model override (nullable, falls back to CHAT_MODEL)

  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  unique(user_id, slug)
);
```

Key decisions:
- `base_system_prompt` is **read-only for built-in experts** in the UI. Users can only modify `user_instructions`. For user-created experts, `base_system_prompt` is fully editable.
- `voice_id` and `model_id` are nullable — null means "use the app default." This makes it trivial to change later without migrating rows.
- `slug` is unique per user, used for URL routing and identification.

### Modify table: `conversations`

Add an `expert_id` column to link conversations to experts.

```sql
alter table conversations
  add column expert_id uuid references experts(id) on delete set null;
```

`expert_id = null` means a conversation with Novus (the default). This preserves backward compatibility with existing conversations.

### Novus as an expert

Novus is **not** a row in the `experts` table. Novus is the default — when `expert_id` is null, the existing `BASE_SYSTEM_PROMPT` + memory system is used. This keeps the current chat flow untouched and avoids special-casing "which expert is the real Novus" in queries.

---

## Built-in Expert Seeding

### Seed data definition

Define the 12 built-in experts in a constants file:

```
frontend/lib/experts/defaults.ts
```

Each entry contains: `slug`, `name`, `tagline`, `description`, `base_system_prompt`, `accent_color`. This is the source of truth for what built-ins look like.

### Seeding flow

On user signup (in the existing `handle_new_user()` trigger or in the app's post-auth flow):

1. Read all entries from `defaults.ts`
2. Insert into `experts` table with `user_id` = new user, `is_builtin` = true
3. `user_instructions` starts empty

If we add new built-in experts later, a migration or background job can seed them for existing users.

### Updating built-ins

When we update a built-in's `base_system_prompt` in `defaults.ts`, we need a strategy:
- **Option A**: On app load, compare the user's built-in version against `defaults.ts` and update `base_system_prompt` silently (user's `user_instructions` are preserved).
- **Option B**: Version the defaults and run a migration.

Recommend **Option A** for simplicity — check and sync on login. The user never edited `base_system_prompt` so overwriting it is safe.

---

## System Prompt Construction

### For Novus (expert_id = null)

No change from current behavior:

```
BASE_SYSTEM_PROMPT (Novus)
+ memory context (long-term + daily)
```

### For an expert

```
expert.base_system_prompt
+ expert.user_instructions (if any)
+ minimal user context (name only in v1)
```

Runtime construction in pseudocode:

```typescript
function buildExpertPrompt(expert: Expert, userName: string): string {
  let prompt = expert.base_system_prompt;

  if (expert.user_instructions?.trim()) {
    prompt += `\n\nAdditional context from the user:\n${expert.user_instructions}`;
  }

  if (userName) {
    prompt += `\n\nThe user's name is ${userName}.`;
  }

  return prompt;
}
```

Experts do **not** get memory context in v1. That's a v3 feature (context sharing).

### Base system prompt structure for experts

Each built-in expert's `base_system_prompt` should follow a consistent structure:

```
You are [Name], [one-line identity].

Background:
[Who you are, your experience, your expertise]

How you communicate:
[Tone, style, directness level]

How you approach conversations:
[What questions you ask first, how you diagnose, when you push back]

You must:
[Hard rules — e.g. always ask about skill level before recommending]

You must not:
[Boundaries — e.g. never give medical diagnoses, always disclaim you're not a licensed X]

Keep responses conversational and focused. This is a voice conversation.
```

---

## API Design

### New endpoints

#### `GET /api/experts`

Returns the current user's experts (built-in + custom), ordered for the contacts list.

Response:
```json
[
  {
    "id": "uuid",
    "slug": "the-chef",
    "name": "The Chef",
    "tagline": "Knows what to do with whatever's in your fridge.",
    "is_builtin": true,
    "accent_color": "#E85D3A",
    "avatar_url": null,
    "conversation_id": "uuid | null"
  }
]
```

`conversation_id` is included by joining on conversations — if the user has an existing chat with this expert, return it so the UI can resume directly.

#### `GET /api/experts/[slug]`

Returns full detail for one expert, including `description`, `base_system_prompt` (for custom experts), and `user_instructions`.

#### `POST /api/experts`

Create a custom expert. Body:

```json
{
  "name": "My Negotiation Coach",
  "tagline": "Helps you get what you want without burning bridges.",
  "description": "...",
  "base_system_prompt": "You are...",
  "accent_color": "#4A90D9"
}
```

`slug` is auto-generated from the name. `is_builtin` is set to false.

#### `PATCH /api/experts/[slug]`

Update an expert. For built-in experts, only `user_instructions`, `accent_color`, and `avatar_url` are writable. For custom experts, all fields are writable.

#### `DELETE /api/experts/[slug]`

Delete a custom expert and its conversation. Built-in experts cannot be deleted (return 403).

### Modified endpoints

#### `POST /api/chat`

Add optional `expertId` to the request body:

```typescript
interface ChatRequest {
  message: string;
  conversationId?: string;
  expertId?: string;  // new
}
```

Changes to the handler:

1. If `expertId` is provided, fetch the expert row
2. If no `conversationId` and an `expertId` is given, look for an existing conversation with that `expert_id`. If none exists, create one with `expert_id` set.
3. Build prompt using `buildExpertPrompt()` instead of `buildSystemPrompt()`
4. Use `expert.model_id ?? CHAT_MODEL` as the model
5. Skip memory agent for expert conversations (v1 — experts don't write to memory)

If `expertId` is null/absent, existing Novus behavior is unchanged.

---

## UI Components

### Contacts List

Accessed from the main interface (sidebar or modal). Shows all experts as a scrollable list.

Each entry shows:
- Expert name
- Tagline
- Accent color indicator
- Last message preview + timestamp (if conversation exists)
- "New" badge if no conversation yet

Sorted: active conversations first (by most recent message), then unused experts alphabetically.

A "Create Expert" button at the bottom opens the creation flow.

### Unified Conversation List

The main conversation list (currently only Novus chats) now includes expert conversations. Each entry shows:
- Expert name + accent color (or "Novus" for default conversations)
- Last message preview
- Timestamp

Sorted by most recent message across all experts.

### Expert Detail / Customization View

Reached by tapping on an expert in the contacts list (long press or info button, not the chat itself).

For built-in experts:
- Shows name, tagline, description (read-only)
- Editable `user_instructions` field ("Add your preferences")
- Accent color picker

For custom experts:
- All fields editable
- Delete option

### Expert Creation Flow

Form with fields:
- Name (required)
- Tagline (required)
- Description
- System prompt / persona instructions (required) — with AI-assisted creation option
- Accent color

**AI-assisted creation**: User describes the expert they want in natural language ("I want someone who can help me with public speaking"). The AI generates a structured system prompt from that description. User can review and edit before saving.

---

## Voice

### v1

All experts use the same TTS voice as Novus. The `voice_id` column exists but is null for all experts.

The voice pipeline is unchanged:
```
Expert response text → TTS (same voice) → audio playback
```

### Future

When per-expert voices are implemented:
1. Set `voice_id` on the expert row
2. In the TTS synthesis step, pass `expert.voice_id ?? DEFAULT_VOICE_ID` to the TTS API
3. No other changes needed — the column is already there

---

## Model Selection

### v1

All experts use `CHAT_MODEL` from `models.ts`. The `model_id` column exists but is null.

In the chat route:
```typescript
const model = expert?.model_id
  ? getModelById(expert.model_id)
  : CHAT_MODEL;
```

### Future

A `getModelById()` function maps string identifiers to Vercel AI SDK model instances:
```typescript
function getModelById(id: string) {
  const models: Record<string, LanguageModel> = {
    'gemini-flash': google('gemini-3-flash-preview'),
    'claude-sonnet': anthropic('claude-sonnet-4-20250514'),
    'gpt-4o': openai('gpt-4o'),
    // ...
  };
  return models[id] ?? CHAT_MODEL;
}
```

---

## RLS Policies

```sql
alter table experts enable row level security;

-- Users can only see their own experts
create policy "Users can view own experts"
  on experts for select
  using (auth.uid() = user_id);

-- Users can create experts for themselves
create policy "Users can create own experts"
  on experts for insert
  with check (auth.uid() = user_id);

-- Users can update their own experts
create policy "Users can update own experts"
  on experts for update
  using (auth.uid() = user_id);

-- Users can delete their own non-builtin experts
create policy "Users can delete own custom experts"
  on experts for delete
  using (auth.uid() = user_id and is_builtin = false);
```

---

## File Structure

New and modified files:

```
frontend/
  lib/
    experts/
      defaults.ts          -- 12 built-in expert definitions (seed data)
      seed.ts              -- function to seed built-ins for a new user
      prompts.ts           -- buildExpertPrompt() and prompt utilities
      types.ts             -- Expert type definitions
  app/
    api/
      experts/
        route.ts           -- GET (list), POST (create)
        [slug]/
          route.ts         -- GET (detail), PATCH (update), DELETE
      chat/
        route.ts           -- modified: accept expertId, branch prompt logic
```

---

## Implementation Order

1. **Database**: Create `experts` table, add `expert_id` to conversations, RLS policies
2. **Seed data**: Write `defaults.ts` with the 12 built-in expert definitions
3. **Seeding**: Implement seed-on-signup flow
4. **Prompt construction**: Write `buildExpertPrompt()`, integrate into chat route
5. **Expert API**: CRUD endpoints
6. **Chat route changes**: Accept `expertId`, conversation-per-expert logic, model selection
7. **UI - Contacts list**: Browse and select experts
8. **UI - Conversation list**: Show expert label on conversations
9. **UI - Customization**: User instructions editor for built-ins, full editor for custom
10. **UI - Creation flow**: Form + AI-assisted prompt generation

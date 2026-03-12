# Mentors

## Overview

Mentors are specialized AI personas available in Novus that carry deep domain knowledge and tailored behavior. Each mentor acts like having a knowledgeable person in your network — someone you can talk to naturally (including by voice) and get real, domain-specific advice without crafting a single prompt.

Novus itself is the default — your personal assistant, the mentor on *you*. When you need specialized help, you open your contacts and reach out to a mentor who knows that domain deeply.

### What Makes Mentors Different

A mentor doesn't just *know* things — it *behaves* like someone with that level of skill:

- **A hiring manager** pushes back on weak answers, asks probing follow-ups, and tells you what you don't want to hear
- **A top Chinese chef** asks what's in your pantry, your skill level, and whether you own a wok before recommending a recipe
- **A plumber** asks you to describe the sound, when it started, and what you've already tried before diagnosing

The interactive back-and-forth is what separates this from reading an article. Mentors ask questions back.

### Built-in Mentors

Novus ships with 12 curated built-in mentors. Users get their own copy of each on signup so they can customize without affecting others. Built-in mentors have `is_builtin=true` and their `base_system_prompt` is read-only in the UI.

The 12 built-in mentors: The Interviewer, The Chef, The Trainer, The Mentor, The Editor, The Accountant, The Handyman, The Guide, The Tutor, The Strategist, The Diplomat, The Creative.

See `frontend/lib/mentors/defaults.ts` for their full definitions (slug, name, tagline, description, base system prompt, accent color).

### Custom Mentors

Users can create entirely new mentors with AI-assisted generation:

1. User describes what they want in plain English
2. `POST /api/mentors/generate` generates a structured draft (name, tagline, description, system prompt)
3. User reviews and edits
4. Saves via `POST /api/mentors`

### Conversation Model

Each mentor has exactly one persistent conversation thread per user (v1). Re-opening a mentor resumes that same thread. This is enforced by a unique index on `(user_id, mentor_id)` in the `conversations` table.

Novus is **not** a row in the `mentors` table — when `mentor_id` is null on a conversation, the existing Novus system prompt + full memory system is used.

## Roadmap

- **v1 (current)**: Built-in mentors, custom mentor creation with AI-assisted generation, one conversation per mentor, voice-enabled, per-mentor accent colors and avatar upload
- **v2**: Attach knowledge bases and reference documents to mentors, AI-generated mentor photos
- **v3**: User-controlled context sharing between Novus and mentors, Novus can brief a mentor before you talk to them
- **v4**: Cross-mentor conversations, Novus can route questions to or consult other mentors mid-conversation
- **v5**: User-customizable themes for mentors and the overall app
- **v6**: Mentor marketplace — publish, browse, install, rate community-created mentors
- **v7**: Technical configurations — model selection per mentor, thinking/reasoning toggles
- **v8**: Agentic capabilities

## Implementation

### Data Model

#### `mentors` table

| Column | Purpose |
|--------|---------|
| `slug` | URL-safe identifier, unique per user |
| `name` / `tagline` / `description` | Identity fields |
| `base_system_prompt` | Core persona prompt (read-only for built-ins) |
| `user_instructions` | User's additions, appended at runtime |
| `is_builtin` | `true` for seeded defaults |
| `accent_color` | Hex color for UI accent |
| `avatar_url` | Optional avatar image URL |
| `voice_id` | TTS voice identifier (nullable, unused in v1) |
| `model_id` | LLM model override (nullable, unused in v1) |

RLS: users can only access their own mentors. Built-in mentors cannot be deleted.

#### Conversation linking

`conversations` table has `mentor_id` column referencing `mentors(id)`. A unique index on `(user_id, mentor_id)` where `mentor_id IS NOT NULL` enforces one conversation per mentor per user.

### System Prompt Construction

**Novus** (`mentor_id = null`): `buildSystemPrompt(memoryContext)` — full memory system.

**Mentor**: `buildMentorPrompt(mentor, userName)` in `frontend/lib/mentors/prompts.ts`:
```
mentor.base_system_prompt
+ mentor.user_instructions (if any)
+ "The user's name is {userName}."
```

Mentors receive memory context scoped to mentor-owned items + a compact global profile card (see memory feature doc).

### Key Files

| File | Role |
|------|------|
| `frontend/lib/mentors/types.ts` | TypeScript interfaces: `MentorRecord`, `MentorListItem`, `DefaultMentorDefinition`, `GeneratedMentorDraft` |
| `frontend/lib/mentors/defaults.ts` | 12 built-in mentor definitions (seed data) |
| `frontend/lib/mentors/prompts.ts` | `buildMentorPrompt()` — assembles system prompt from mentor record |
| `frontend/lib/mentors/server.ts` | Server utilities for mentor operations |
| `frontend/app/api/mentors/route.ts` | `GET` (list) and `POST` (create) endpoints |
| `frontend/app/api/mentors/[slug]/route.ts` | `GET` (detail), `PATCH` (update), `DELETE` endpoints |
| `frontend/app/api/mentors/generate/route.ts` | `POST` — AI-assisted mentor draft generation |
| `frontend/app/api/mentors/avatar/upload-url/route.ts` | `POST` — signed upload URL for avatar images |
| `frontend/app/api/chat/route.ts` | Accepts `mentorId`, branches prompt construction, scopes memory |
| `frontend/app/home/components/MentorDetailPanel.tsx` | Mentor detail/customization UI |
| `frontend/app/home/components/CreateMentorPanel.tsx` | Mentor creation flow UI |

### API

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/mentors` | GET | List user's mentors (built-in + custom), includes `conversation_id` if exists |
| `/api/mentors` | POST | Create a custom mentor |
| `/api/mentors/[slug]` | GET | Full mentor detail |
| `/api/mentors/[slug]` | PATCH | Update mentor (built-ins: only `user_instructions`, `accent_color`, `avatar_url`) |
| `/api/mentors/[slug]` | DELETE | Delete custom mentor (built-ins return 403) |
| `/api/mentors/generate` | POST | AI-generated mentor draft from natural language description |
| `/api/mentors/avatar/upload-url` | POST | Get signed upload URL for avatar image |

### Chat Route Integration

In `frontend/app/api/chat/route.ts`:

1. If `mentorId` is provided, the mentor record is fetched
2. If no `conversationId` exists for that mentor, one is created with `mentor_id` set
3. System prompt is built via `buildMentorPrompt()` instead of `buildSystemPrompt()`
4. Memory is loaded with `actor: 'mentor'` scoping (mentor-owned items + global profile)
5. Memory agent writes with `owner_type: 'mentor'` and `owner_id` set to the mentor's ID

### Note on Naming

The docs directory previously used "experts" as the feature name. The codebase uses "mentors" throughout — database table, API routes, lib files, and UI components all use the `mentor` naming.

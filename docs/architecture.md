# Keen Architecture

## Tech Stack

| Layer | Technology | Why |
|-------|------------|-----|
| Frontend | Next.js | Already set up, good for web + API routes |
| Backend | FastAPI | Python for ML/voice libs, async support |
| Database | Supabase (Postgres) | Auth, realtime, easy setup |
| Vector Search | pgvector | Semantic retrieval, no extra service |
| LLM | Claude API | Depth and reasoning for explore mode |
| Transcription | Whisper (local or API) | Control over voice pipeline |
| TTS | ElevenLabs / PlayHT | Natural voice output |

---

## MVP Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (Next.js)                       │
├─────────────────────────────────────────────────────────────────┤
│  Voice Interface          │  Review Dashboard                   │
│  - Mic capture            │  - Thread list                      │
│  - Audio playback         │  - Conversation history             │
│  - Waveform visualizer    │  - Extracted items (actions, ideas) │
│  - Turn-taking controls   │  - Today view                       │
└─────────────────┬─────────┴──────────────────┬──────────────────┘
                  │                            │
                  ▼                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                      API Layer (FastAPI)                        │
├─────────────────────────────────────────────────────────────────┤
│  /voice/transcribe    - Whisper transcription                   │
│  /voice/synthesize    - TTS generation                          │
│  /chat                - Conversation orchestration              │
│  /threads             - CRUD for threads                        │
│  /items               - Extracted items (actions, ideas, etc.)  │
│  /search              - Semantic search across threads          │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Supabase (Postgres + pgvector)              │
├─────────────────────────────────────────────────────────────────┤
│  users              │  threads           │  items               │
│  - id               │  - id              │  - id                │
│  - email            │  - user_id         │  - thread_id         │
│  - created_at       │  - name            │  - conversation_id   │
│                     │  - summary         │  - type (action/idea/│
│                     │  - created_at      │    commitment/question)
│                     │                    │  - content           │
│  conversations      │  context_chunks    │  - status (open/done)│
│  - id               │  - id              │  - due_date          │
│  - thread_id        │  - conversation_id │  - created_at        │
│  - transcript       │  - content         │                      │
│  - summary          │  - embedding       │                      │
│  - created_at       │  - created_at      │                      │
└─────────────────────┴────────────────────┴──────────────────────┘
```

---

## Data Model

### users
```sql
create table users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  created_at timestamptz default now()
);
```

### threads
```sql
create table threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  name text not null,
  summary text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

### conversations
```sql
create table conversations (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid references threads(id) on delete cascade,
  transcript text not null,
  summary text,
  created_at timestamptz default now()
);
```

### items (extracted from conversations)
```sql
create table items (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) on delete cascade,
  thread_id uuid references threads(id) on delete cascade,
  type text not null check (type in ('action', 'idea', 'commitment', 'question')),
  content text not null,
  status text default 'open' check (status in ('open', 'done')),
  due_date date,
  created_at timestamptz default now()
);
```

### context_chunks (for RAG retrieval)
```sql
create table context_chunks (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) on delete cascade,
  content text not null,
  embedding vector(1536),
  created_at timestamptz default now()
);

create index on context_chunks using ivfflat (embedding vector_cosine_ops);
```

---

## Voice Pipeline

### Input (User → Keen)
```
Mic capture (browser MediaRecorder)
    ↓
Audio chunks → WebSocket or chunked POST
    ↓
Whisper transcription (FastAPI)
    ↓
Transcript returned to frontend
    ↓
Full utterance sent to /chat
```

### Output (Keen → User)
```
LLM response text
    ↓
TTS synthesis (ElevenLabs API)
    ↓
Audio stream → frontend
    ↓
Playback with visualizer
```

### Turn-taking (solving the interruption problem)
Options to implement:
1. **Push-to-talk**: Hold button to speak (simplest, most control)
2. **VAD with long pause threshold**: Only end turn after 1.5-2s silence
3. **Explicit end signal**: User says "done" or double-taps
4. **Hybrid**: VAD + visual indicator showing "still listening..."

Start with push-to-talk for MVP, iterate on smarter detection later.

---

## Conversation Flow

```
User speaks
    ↓
Transcribe (Whisper)
    ↓
Determine intent:
  - Which thread? (route or ask)
  - What mode? (explore/capture/manage)
    ↓
Retrieve context:
  - Thread summary
  - Recent conversations
  - Semantic search for relevant chunks
    ↓
Build prompt:
  - System prompt (persona, mode)
  - Retrieved context
  - Current transcript
    ↓
LLM response (Claude)
    ↓
Extract items:
  - Action items
  - Commitments
  - Key ideas
  - Open questions
    ↓
Store:
  - Conversation transcript + summary
  - Extracted items
  - Context chunks with embeddings
    ↓
Synthesize speech (TTS)
    ↓
Return audio to user
```

---

## Tonight's Build Plan (Web MVP)

### Phase 1: Database Setup
- [ ] Create Supabase tables (users, threads, conversations, items, context_chunks)
- [ ] Enable pgvector extension
- [ ] Set up RLS policies

### Phase 2: Basic Voice Loop
- [ ] Mic capture component (already have MicVisualizer)
- [ ] Send audio to backend
- [ ] Whisper transcription endpoint
- [ ] Return transcript to frontend
- [ ] Display transcript in chat

### Phase 3: Chat + Memory
- [ ] /chat endpoint with Claude
- [ ] Basic thread routing (single thread for now)
- [ ] Store conversations in DB
- [ ] Retrieve recent context for prompt

### Phase 4: TTS Response
- [ ] ElevenLabs integration
- [ ] Stream audio back to frontend
- [ ] Playback with visualizer

### Phase 5: Review UI
- [ ] Thread list view
- [ ] Conversation history
- [ ] Extracted items display

---

## Future Phases (Post-MVP)

### Phase 6: Smart Extraction
- Auto-extract action items, commitments, ideas
- Thread summary updates after each conversation

### Phase 7: Chief of Staff Mode
- Proactive follow-ups
- Today view with priorities
- "You said you'd..." reminders

### Phase 8: Mobile App
- React Native / Expo
- Background audio recording
- Push notifications for follow-ups

### Phase 9: Integrations (MCP)
- Google Calendar
- Email drafts
- Task managers (Todoist, Linear, etc.)

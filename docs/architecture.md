# Keen Architecture

## Tech Stack

| Layer | Technology | Why |
|-------|------------|-----|
| App + API | Next.js | Shared TypeScript surface for UI, route handlers, auth, and AI orchestration |
| Database | Supabase (Postgres) | Auth, persistence, RLS, and pgvector-backed memory |
| Chat Models | AI SDK providers | Common streaming interface across Google, Anthropic, and OpenAI models |
| Search | Brave / Exa | Optional live retrieval behind auto, required, or off search modes |
| STT (dormant) | Deepgram | Hidden token route retained for a future voice redesign |
| TTS (dormant) | ElevenLabs | Hidden spoken-response route retained for a future voice redesign |

## Runtime Shape

```
Browser (Next.js UI)
  |-- chat/search/memory/mentors --> Next.js API routes
  |-- dormant text-to-speech route --> Next.js /api/tts --> ElevenLabs
  |-- dormant STT token route ------> Next.js /api/deepgram/token

Next.js API routes
  |-- auth/session -------------> Supabase Auth
  |-- persistence --------------> Supabase Postgres
  |-- chat/memory/search -------> AI/search providers
```

## Voice Pipeline

Voice controls are intentionally hidden in the current composer. There is no visible UI path for microphone capture, transcription auto-send, or spoken assistant playback. The old home-screen voice orchestration hooks were removed; the remaining dormant pieces are server routes and data fields that can be reused or replaced by a future voice redesign.

### Input

```
Future mic capture
  -> POST /api/deepgram/token
  -> future STT client integration
  -> submitted text sent to /api/chat
```

The Deepgram API key stays server-side in `frontend/.env.local`. The current route mints a short-lived token, but no composer UI calls it.

Note: the Deepgram path has unit coverage for token minting only. Browser microphone capture and realtime transcription need to be redesigned before being exposed again.

### Output

```
Assistant text
  -> POST /api/tts
  -> ElevenLabs audio stream
  -> future playback client
```

## Persistence

Supabase owns durable product state:

- `conversations` and `messages` for persisted chat history
- `conversation_branches` and message `previous_message_id` for branching
- `threads` for inline thread persistence
- `memory_items` and related memory tables for structured memory
- `mentors` and storage-backed avatar metadata for mentor configuration

The Python/FastAPI backend has been removed; new server behavior should be implemented as Next.js route handlers unless it requires a long-lived non-serverless process.

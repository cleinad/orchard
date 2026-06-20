# Keen Architecture

## Tech Stack

| Layer | Technology | Why |
|-------|------------|-----|
| App + API | Next.js | Shared TypeScript surface for UI, route handlers, auth, and AI orchestration |
| Database | Supabase (Postgres) | Auth, persistence, RLS, and pgvector-backed memory |
| Chat Models | AI SDK providers | Common streaming interface across Google, Anthropic, and OpenAI models |
| Search | Brave / Exa | Optional live retrieval behind explicit search mode |
| STT | Deepgram | Browser microphone audio streams directly to Deepgram with short-lived tokens |
| TTS | ElevenLabs | Optional spoken assistant responses |

## Runtime Shape

```
Browser (Next.js UI)
  |-- chat/search/memory/mentors --> Next.js API routes
  |-- text-to-speech -----------> Next.js /api/tts --> ElevenLabs
  |-- speech-to-text token -----> Next.js /api/deepgram/token
  |-- speech-to-text audio -----> Deepgram WebSocket

Next.js API routes
  |-- auth/session -------------> Supabase Auth
  |-- persistence --------------> Supabase Postgres
  |-- chat/memory/search -------> AI/search providers
```

## Voice Pipeline

### Input

```
Mic capture (browser MediaRecorder)
  -> POST /api/deepgram/token
  -> Deepgram /v1/listen WebSocket using Sec-WebSocket-Protocol
  -> transcript state in the chat composer
  -> submitted text sent to /api/chat
```

The Deepgram API key stays server-side in `frontend/.env.local`. The browser receives only a short-lived token and opens the realtime WebSocket directly.

Note: this direct Deepgram STT path has unit coverage for token minting only. The real browser microphone/WebSocket flow has not been manually validated and should be treated as experimental.

### Output

```
Assistant text
  -> POST /api/tts
  -> ElevenLabs audio stream
  -> browser playback with visualization
```

## Persistence

Supabase owns durable product state:

- `conversations` and `messages` for persisted chat history
- `conversation_branches` and message `previous_message_id` for branching
- `threads` for inline thread persistence
- `memory_items` and related memory tables for structured memory
- `mentors` and storage-backed avatar metadata for mentor configuration

The Python/FastAPI backend has been removed; new server behavior should be implemented as Next.js route handlers unless it requires a long-lived non-serverless process.

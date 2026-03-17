# Novus

A voice-native AI thinking partner with specialized mentors, persistent memory, and live web search.

## Project Structure

```
frontend/    Next.js app — UI, API routes, chat, memory, mentors
backend/     FastAPI — voice pipeline (Deepgram STT)
docs/        Product docs, feature specs, architecture
```

The Next.js app serves as both the frontend and the primary API server. The Python backend handles voice/STT only.

## Setup

### Frontend (`frontend/.env.local`)

```bash
# Supabase (required)
# Get these from: https://app.supabase.com/project/_/settings/api
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key          # use the anon key, NOT the service role key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key       # server-only, used for admin operations

# LLM — Chat responses (required)
GOOGLE_GENERATIVE_AI_API_KEY=your_google_api_key               # Gemini — primary chat model

# LLM — Memory extraction (required)
ANTHROPIC_API_KEY=your_anthropic_api_key                       # Claude Haiku — background memory agent

# LLM — Memory embeddings (required for semantic memory recall)
OPENAI_API_KEY=your_openai_api_key                             # text-embedding-3-small for memory embeddings

# Live web search (optional — search toggle works without it but returns "unavailable")
TAVILY_API_KEY=your_tavily_api_key

# Voice — Text-to-speech (optional)
ELEVENLABS_API_KEY=your_elevenlabs_api_key
ELEVENLABS_VOICE_ID=your_elevenlabs_voice_id

# Backend URL (optional — only needed if running voice/STT)
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
```

**Note:** Only `NEXT_PUBLIC_*` variables are exposed to the browser. All other keys are server-only (used in Next.js API routes). Never put secret keys in `NEXT_PUBLIC_*` variables.

### Backend (`backend/.env`)

```bash
# Deepgram — Speech-to-text (required for voice input)
DEEPGRAM_API_KEY=your_deepgram_api_key
DEEPGRAM_PROJECT_ID=your_deepgram_project_id
```

## Running

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Opens at [http://localhost:3000](http://localhost:3000).

### Backend

```bash
cd backend
uv sync
uv run uvicorn main:app --reload --ws wsproto
```

Runs at [http://localhost:8000](http://localhost:8000).
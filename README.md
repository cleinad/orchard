# Keen

A voice-native AI thinking partner with specialized mentors, persistent memory, and explicit search mode for live web retrieval.

## Documentation

Start with [docs/README.md](./docs/README.md) for the product overview and the full documentation map.

## Project Structure

```
frontend/    Next.js app — UI, API routes, chat, memory, mentors
docs/        Product docs, feature specs, architecture
```

The Next.js app serves as both the frontend and the API server. Browser voice input uses a short-lived Deepgram token minted by a Next.js API route.

## Setup

### Frontend (`frontend/.env.local`)

```bash
# Supabase (required)
# Get these from: https://app.supabase.com/project/_/settings/api
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key          # use the anon key, NOT the service role key

# LLM — Chat responses (required)
GOOGLE_GENERATIVE_AI_API_KEY=your_google_api_key               # Gemini — primary chat model

# LLM — Memory extraction (required)
ANTHROPIC_API_KEY=your_anthropic_api_key                       # Claude Haiku — background memory agent

# LLM — Memory embeddings (required for semantic memory recall)
OPENAI_API_KEY=your_openai_api_key                             # text-embedding-3-small for memory embeddings

# Live web search (optional — search mode works without it but returns "unavailable")
BRAVE_API_KEY=your_brave_api_key
EXA_API_KEY=your_exa_api_key

# Voice — Text-to-speech (optional)
ELEVENLABS_API_KEY=your_elevenlabs_api_key
ELEVENLABS_VOICE_ID=your_elevenlabs_voice_id

# Voice — Speech-to-text (optional)
DEEPGRAM_API_KEY=your_deepgram_api_key
```

**Note:** Only `NEXT_PUBLIC_*` variables are exposed to the browser. All other keys are server-only (used in Next.js API routes). Never put secret keys in `NEXT_PUBLIC_*` variables.

## Running

```bash
cd frontend
npm install
npm run dev
```

Opens at [http://localhost:3000](http://localhost:3000).

# Local Setup

Orchard runs as a Next.js application backed by Supabase and one or more
model-provider APIs.

## Prerequisites

- Node.js and npm
- A compatible Supabase project with the active Orchard migrations applied
- At least one supported chat-model provider API key

The repository's canonical database schema is the ordered migration set in
`supabase/migrations/`. Files in `supabase/legacy-migrations/` are historical
and must not be applied on top of the consolidated baseline.

## Install and run

```bash
cd frontend
npm ci
npm run dev
```

The application opens at [http://localhost:3000](http://localhost:3000).

## Environment

Create `frontend/.env.local`. Never commit this file.

Required Supabase settings:

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Configure at least one chat provider:

```bash
OPENAI_API_KEY=your_openai_key
ANTHROPIC_API_KEY=your_anthropic_key
GOOGLE_GENERATIVE_AI_API_KEY=your_google_key
DEEPSEEK_API_KEY=your_deepseek_key
ALIBABA_API_KEY=your_alibaba_key
MOONSHOT_API_KEY=your_moonshot_key
```

Only one is required for basic chat. The model picker shows which configured
models are available.

Optional capabilities:

```bash
# Provider-backed live search
BRAVE_API_KEY=your_brave_key
EXA_API_KEY=your_exa_key

# Model-based Auto search planning
SEARCH_PLANNER_BASE_URL=your_openai_compatible_base_url
SEARCH_PLANNER_API_KEY=your_search_planner_key
SEARCH_PLANNER_MODEL=your_model_id
```

Only variables prefixed with `NEXT_PUBLIC_` are exposed to browser code. Keep
all provider keys server-side.

## Supabase environments

The checked-in `supabase/config.toml` uses the canonical local project identity
`orchard-local-db`. Orchard's maintained development environment may provide
Supabase through an existing localhost tunnel, so do not start another stack on
the same ports without checking the environment first.

Before database work, inspect the current environment and repository guidance.
Do not apply migrations, reset a database, or start a competing local stack
without confirming the target and recovery path.

Apply Orchard migrations as the database-only `supabase_admin` role. The active
migration set installs a trigger on the managed `auth.users` table, which a
restricted runtime or ordinary `postgres` role does not own. Never use
`supabase_admin` in the application runtime or expose its credentials to the
browser.

## Verify the application

From `frontend/`:

```bash
npm test
npx tsc --noEmit
npm run lint
npm run build
```

Run browser tests with:

```bash
npm run test:e2e
```

See [Testing](../testing/README.md) for focused commands and test locations.

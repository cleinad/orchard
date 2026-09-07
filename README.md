# Orchard

Orchard is a conversational learning tool for understanding anything.

Highlight part of a response to explore it in an inline thread, or branch a
conversation when a question deserves its own path. The main chat stays intact
while you follow the details that matter.

## What makes Orchard different

- **Inline threads** turn any selected passage into a focused side conversation.
- **Conversation branches** let one chat hold multiple paths without mixing
  their context.
- **Persistent chats and workspaces** keep longer learning projects organized.

Orchard also supports temporary chats, image attachments,
model selection, response-style controls, and optional live search.

## Run locally

The application requires a compatible Supabase project and at least one
configured chat-model provider.

```bash
cd frontend
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

See [Local setup](./docs/development/setup.md) for environment variables,
database expectations, and verification commands.

## Repository map

```text
frontend/    Next.js application, API routes, tests, and browser tests
supabase/    Active database migrations, legacy migrations, seeds, and SQL tests
docs/        Product, architecture, feature, design, and development documentation
```

Start with the [documentation map](./docs/README.md) to find the relevant
document. Planned work, bugs, and product ideas live in the
[backlog](./docs/backlog.md).

# Orchard Repository Guidance

Orchard is a conversational learning tool built around inline threads and
conversation branching. `README.md` is the human entrypoint;
`docs/README.md` is the documentation map.

## Before changing the repository

- Read `docs/README.md`, then the closest feature, architecture, design, or
  development document for the work.
- Inspect the implementation before relying on a documentation claim that may
  be stale.
- Preserve unrelated working-tree changes.
- Use `$orchard-supabase` for Supabase, PostgreSQL, migration, Auth, Storage, or
  database-dependent work.

## Documentation model

- Product, architecture, feature, design, and development docs describe current
  shipped behavior.
- `docs/backlog.md` is the single home for bugs, improvements, feature ideas,
  and longer-term directions that are not shipped.
- Create a file under `docs/plans/` only for substantial active work that needs
  more detail than a backlog item. Link it from the backlog and remove it after
  the work ships.
- Update the closest authoritative document instead of duplicating guidance.
- Keep documents linked from `docs/README.md` and add a short related-docs
  section when another page is a natural continuation.

## Terminology

- `Orchard` names the product, not a separate assistant persona.
- Use `chat`, `workspace chat`, `temporary chat`, `inline thread`, and
  `conversation branch` for the current chat surfaces.
- Do not present disabled or dormant code paths as shipped capabilities.
- Legacy internal identifiers may remain for compatibility; do not rename them
  opportunistically.

## Verification

Run checks from `frontend/`:

```bash
npm test
npx tsc --noEmit
npm run lint
npm run build
npm run test:e2e
```

Choose the smallest checks proportional to the change. Documentation-only
changes still require link and terminology checks.

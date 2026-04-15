# Design tokens (Keen frontend)

This document lists **design tokens that exist in the repo** today: CSS custom properties, Tailwind theme mappings, and where they are defined.

Source of truth for implementation: `frontend/app/globals.css`, `frontend/app/layout.tsx` (Next.js font variables), and `frontend/lib/body-font.ts` (user reading-font preference).

---

## Typography

### User reading font (default body text)

| Token | Role |
|--------|------|
| `--font-body` | The user’s **reading font** (Satoshi or Newsreader), set from settings and synced to `document.documentElement` with `!important` in `lib/body-font.ts`. |

| Tailwind | Maps to |
|----------|---------|
| `font-reading` | `var(--font-body)` |

**Default:** `body` uses `font-family: var(--font-body)` so most UI inherits the reading font without adding a class.

The name **`font-reading`** avoids clashing with Tailwind’s generic `font-body` naming; it explicitly means “the user-selected body/reading stack.”

### Fixed sans stack (always Satoshi)

| Token | Role |
|--------|------|
| `--font-stack-sans` | Literal Satoshi stack (single canonical definition). |
| `--font-sans` | Alias: `var(--font-stack-sans)`. |

| Tailwind | Maps to |
|----------|---------|
| `font-sans` | `var(--font-stack-sans)` |

Use when the surface should **always** use Satoshi (for example marketing chrome, buttons, or labels that must stay geometric sans regardless of reading-font setting).

### Fixed serif stack (always Newsreader)

| Token | Role |
|--------|------|
| `--font-stack-serif` | Newsreader stack via Next.js variable + fallbacks. |
| `--font-serif` | Alias: `var(--font-stack-serif)`. |

| Tailwind | Maps to |
|----------|---------|
| `font-serif` | `var(--font-stack-serif)` |

Use for **always-Newsreader** editorial moments (pull quotes, special sections). Do not confuse with the user’s reading font when they have chosen Newsreader: that is still `--font-body` / `font-reading`.

### Display / heading face (Fraunces)

| Token | Source |
|--------|--------|
| `--font-heading` | Next.js `Fraunces` in `app/layout.tsx` (`next/font/google`). |

| Class | Role |
|-------|------|
| `font-heading` | Defined in `globals.css`; uses `var(--font-heading)` with a Georgia fallback. |

### Monospace

Markdown and inline code use a **system monospace stack** in `globals.css` (not a branded token): `ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace`.

---

## Color and surface (semantic)

These are defined per theme on `:root` and `:root[data-theme="…"]` in `globals.css`. Tailwind maps them under `@theme inline` as:

| Tailwind color token | CSS variable |
|----------------------|--------------|
| `background` | `--background` |
| `foreground` | `--foreground` |
| `surface` | `--surface` |
| `muted` | `--muted` |
| `accent` | `--accent` |
| `border-subtle` | `--border-subtle` |

### Theme IDs

| `data-theme` | Notes |
|--------------|--------|
| `blizzard` | Default light; paired with `:root` in CSS. |
| `dune` | Light, warm. |
| `stellar` | Dark. |
| `twilight` | Dark. |

Theme selection is handled separately from typography; see theme scripts in `app/layout.tsx` and `lib/theme`.

---

## Markdown and code blocks

Syntax-highlighting and code-panel colors are **theme-scoped** variables in `globals.css`, for example:

- `--markdown-inline-code-bg`, `--markdown-inline-code-border`
- `--markdown-code-panel-bg`, `--markdown-code-header-bg`, `--markdown-code-panel-border`, `--markdown-code-panel-divider`, `--markdown-code-panel-shadow`
- `--markdown-code-button-*`, `--markdown-code-text`, `--markdown-code-muted`, `--markdown-code-comment`
- `--markdown-code-keyword`, `--markdown-code-string`, `--markdown-code-number`, `--markdown-code-function`, `--markdown-code-type`, `--markdown-code-accent`, `--markdown-code-love`, `--markdown-code-gold`, `--markdown-code-foam`

These are consumed by `.markdown-content` and related classes, not exposed as Tailwind color aliases by default.

---

## Atmospheric (marketing / home backdrop)

Used for soft background washes (see `frontend/lib/marketing-backdrop` and `globals.css`):

- `--ambient-cursor-glow`
- `--ambient-blob-a`
- `--ambient-blob-b`

---

## Related docs

- [design-language.md](./design-language.md) — product-facing typography and layout philosophy.
- `frontend/lib/body-font.ts` — `BODY_FONT_STORAGE_KEY`, `BodyFontId`, `applyBodyFont`.
- `frontend/app/components/BodyFontSync.tsx` — reapplies stored font after hydration.

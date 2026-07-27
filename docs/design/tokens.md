# Design Tokens

This document records design tokens implemented in
`frontend/app/globals.css`, `frontend/app/layout.tsx`,
`frontend/lib/theme.ts`, and `frontend/lib/body-font.ts`.

## Typography

| Token or utility | Role |
|---|---|
| `--font-body`, `font-reading` | User-selected reading font |
| `--font-stack-sans`, `--font-sans`, `font-sans` | Fixed Satoshi stack |
| `--font-stack-serif`, `--font-serif`, `font-serif` | Fixed Newsreader stack |
| `--font-heading`, `font-heading` | Fraunces display face |

The body inherits `--font-body`. The current reading-font choices are Satoshi
and Newsreader, with Satoshi as the default.

Markdown code uses the system monospace stack defined in `globals.css`.

## Semantic colors

Each theme defines:

| Tailwind color | CSS variable |
|---|---|
| `background` | `--background` |
| `foreground` | `--foreground` |
| `surface` | `--surface` |
| `muted` | `--muted` |
| `accent` | `--accent` |
| `border-subtle` | `--border-subtle` |

Use these semantic names in application components. Theme-specific literals
belong in the theme definitions.

## Themes

| ID | Mode | Character |
|---|---|---|
| `blizzard` | light | cool neutral |
| `dune` | light | warm neutral |
| `stellar` | dark | near-black neutral |
| `twilight` | dark | blue dark |

Blizzard is the default light theme. Stellar is the default dark theme.
`frontend/lib/theme.ts` owns IDs, display labels, modes, and theme persistence.

Theme selection and reading-font selection are independent.

## Markdown

`.markdown-content` owns the shared response typography and spacing for:

- headings and paragraphs
- lists
- tables
- blockquotes
- links
- inline and block code
- KaTeX math
- inline citations and thread markers

Code-panel and syntax colors are theme-scoped variables beginning with
`--markdown-`. They are consumed by Markdown classes rather than exported as
general Tailwind colors.

## Thread highlights

Thread overlay and fallback marker colors derive from semantic foreground,
accent, and surface variables. The overlay implementation owns geometry; CSS
tokens should not change marker text order or layout.

See [Inline-thread rendering](../implementation/inline-thread-rendering.md)
before changing highlight markup or selection-affecting styles.

## Public surfaces

The landing and auth pages intentionally use explicit dark values over
`frontend/app/assets/orchard-dusk-backdrop.png`. Those values are local to the
public artwork treatment and are not general application tokens.

## Related docs

- [Design language](./design-language.md)
- [Inline-thread rendering](../implementation/inline-thread-rendering.md)

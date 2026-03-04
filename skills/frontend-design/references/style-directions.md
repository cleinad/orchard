# Frontend Style Directions

Use this file when choosing a visual direction in `SKILL.md`.

## 1) Editorial Contrast

- Tone: premium, thoughtful, content-led
- Typography:
  - Display: "Fraunces", serif
  - Body: "Source Sans 3", sans-serif
- Visual traits: large headlines, generous whitespace, strong type contrast
- Motion cues: fade-up reveals with slight delay between sections
- Token starter:

```css
:root {
  --color-bg: #f4f1ea;
  --color-surface: #fffdf9;
  --color-text: #161513;
  --color-muted: #5f5b55;
  --color-accent: #b24a2a;
  --color-border: #d9d1c6;
}
```

## 2) Technical Blueprint

- Tone: product-focused, precise, modern
- Typography:
  - Display: "Space Grotesk", sans-serif
  - Body: "IBM Plex Sans", sans-serif
  - Mono: "IBM Plex Mono", monospace
- Visual traits: grid emphasis, sharp edges, restrained accents, data-forward layout
- Motion cues: subtle x/y slide-ins for panels and charts
- Token starter:

```css
:root {
  --color-bg: #f7fafc;
  --color-surface: #ffffff;
  --color-text: #0f172a;
  --color-muted: #475569;
  --color-accent: #0ea5e9;
  --color-border: #d9e2ec;
}
```

## 3) Warm Productive

- Tone: approachable, optimistic, action-oriented
- Typography:
  - Display: "Sora", sans-serif
  - Body: "Plus Jakarta Sans", sans-serif
- Visual traits: soft corners, layered cards, warm highlights, strong CTA contrast
- Motion cues: scale-and-fade entrance for card groups and CTA emphasis on hover
- Token starter:

```css
:root {
  --color-bg: #fff8ef;
  --color-surface: #ffffff;
  --color-text: #1f1a16;
  --color-muted: #6f6258;
  --color-accent: #ef6c33;
  --color-border: #f0dfcf;
}
```

## 4) Bold Poster

- Tone: expressive, campaign-like, high-energy
- Typography:
  - Display: "Bebas Neue", sans-serif
  - Body: "Manrope", sans-serif
- Visual traits: oversized headlines, dramatic color blocking, asymmetrical composition
- Motion cues: directional reveals and quick mask transitions
- Token starter:

```css
:root {
  --color-bg: #fdfdfb;
  --color-surface: #ffffff;
  --color-text: #101010;
  --color-muted: #4b4b4b;
  --color-accent: #ff4d00;
  --color-border: #e7e7e2;
}
```

## Selection Rule

- Choose one direction as default.
- Borrow at most one secondary idea from another direction.
- Keep typography and accent palette coherent with the chosen direction.

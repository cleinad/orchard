# Design Language

Orchard uses a calm editorial interface that keeps the material being learned
ahead of the product chrome.

This is the current visual and interaction direction. Implemented variables and
utilities are listed in [Design tokens](./tokens.md).

## Desired character

Orchard should feel:

- calm
- intelligent
- readable
- spacious
- deliberate
- curious without being playful

It should not feel like a futuristic AI dashboard, a card-heavy productivity
suite, or a product trying to prove its intelligence through motion and jargon.

## Principles

### Keep one dominant task

Each surface should make its main action obvious:

- landing page: understand the promise and enter the app
- auth page: sign in or create an account
- chat: read, ask, thread, and branch
- workspace: orient within a subject and continue learning

Secondary controls should not compete with the content.

### Let typography carry identity

Use scale, measure, spacing, and contrast before adding decorative containers.
Long responses need a comfortable reading rhythm; compact controls need a
stable product voice.

### Prefer low chrome

Do not introduce a card merely to group every section. Use enclosure when it
clarifies an input, modal decision, source tray, or dense control group.

Borders and shadows should establish hierarchy without making every region look
detachable.

### Preserve the learner's place

Threads, branches, maps, and side panels must make context easier to follow.
Transitions should maintain transcript position and make the active path clear.

### Keep atmosphere subordinate

The public Orchard surfaces use the orchard-at-dusk image and dark overlays as a
quiet setting for the product promise. Inside the application, theme colors and
subtle surfaces should support reading rather than recreate a marketing hero.

## Typography

### Fixed Newsreader

Use `font-heading` for major display headings and `font-serif` for deliberate
editorial passages. Both use Newsreader and should add warmth and authority
without decorating every section title.

### User-selected reading font

Normal reading content follows `--font-body` through `font-reading` or ordinary
body inheritance. The current choices are Satoshi and Newsreader.

Use it for chat responses, explanatory copy, and other reading surfaces.

### Fixed Satoshi

Use `font-sans` for compact product chrome that should remain stable regardless
of the reading preference:

- buttons
- form labels
- metadata
- menus
- status text

### Sentence case

Product labels, section headings, buttons, and empty states use sentence case.
Use position, weight, spacing, and contrast for emphasis instead of all caps.

## Color and surfaces

The application supports four implemented themes:

- Blizzard — cool light
- Dune — warm light
- Stellar — neutral dark
- Twilight — blue dark

Use semantic theme tokens instead of embedding a theme's literal colors in
ordinary application components.

Prefer:

- restrained accents
- subtle borders
- surfaces close to the page background
- readable foreground contrast
- one obvious primary action

Avoid:

- multiple competing accent colors
- thick outlines
- heavy shadow stacks
- translucent effects that reduce readability
- color as the only indicator of state

The landing and auth artwork is an intentional exception with explicit dark
values; it is not the default component palette.

## Layout

- Keep long-form reading measures controlled.
- Let the transcript own most of the viewport.
- Keep headers simple and place navigation near the true page edges.
- Use whitespace to establish hierarchy.
- Increase density only where comparison or repeated controls require it.

On narrow screens, side surfaces may become overlays, but they should include a
clear route back to the main chat.

## Components

### Buttons

Use the shared button styles and icon tooltips. Primary actions should be firm
and simple; secondary actions should stay quiet until hovered or focused.

### Inputs

Inputs should have clear labels, thin borders, visible focus treatment, and
enough height for touch without becoming oversized.

### Messages

User messages use a quiet bubble. Assistant responses remain visually open so
the content reads like a document rather than a stack of cards.

Thread highlights must remain legible across prose, code, math, and tables.
Branch controls should reveal structure without interrupting reading flow.

### Feedback

Place errors, warnings, loading states, and confirmations near the action they
govern. Destructive confirmations must state what will be removed.

## Copy

Copy should be clear, direct, and specific about the learning action.

Prefer terms such as:

- chat
- thread
- branch
- response
- source
- workspace

Avoid AI hype, vague productivity promises, and language that treats the product
as a magical persona.

## Review checklist

Before shipping a surface:

1. Is its dominant task clear?
2. Can any container or control be removed?
3. Does the type hierarchy do enough of the work?
4. Does the layout preserve reading context?
5. Are focus, hover, loading, error, and destructive states clear?
6. Does it still feel like Orchard in both light and dark themes?

## Current references

- `frontend/app/page.tsx`
- `frontend/app/components/AuthPage.tsx`
- `frontend/app/(authenticated)/(chat-shell)/home/[[...conversationId]]/page.tsx`
- `frontend/app/home/components/MessageRow.tsx`
- `frontend/app/home/components/ThreadPanel.tsx`

## Related docs

- [Design tokens](./tokens.md)
- [Product](../product.md)
- [Inline threads](../features/inline-threads.md)

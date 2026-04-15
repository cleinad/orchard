# Keen Design Language

## Purpose

This document captures the current visual philosophy for Keen.

Use it when designing or refactoring frontend surfaces so future work stays aligned with the product direction and does not drift back toward generic AI SaaS patterns.

This is a current design reference, not a historical plan.

## What To Call It

The clearest name for this style is:

**Quiet editorial research UI**

That means:

- editorial in typography and composition
- quiet in tone, restraint, and color
- research-oriented in seriousness and clarity
- still a UI, not a magazine layout or art project

Another acceptable shorthand is:

**editorial minimalism for research tools**

## Core Feel

Keen should feel like:

- calm
- serious
- intelligent
- spacious
- focused
- deliberate
- curious without being playful

It should not feel like:

- a glossy startup landing page
- a futuristic AI dashboard
- a glassmorphism experiment
- a productivity app full of cards
- a luxury brand with dramatic black-on-black styling
- a “magic assistant” product trying to impress with motion and jargon

The product should feel like a place to think carefully, not a place that is begging for attention.

## Style Thesis

Keen combines editorial typography with practical product utility.

The visual system should make the product feel more like a serious research environment and less like a feature-marketed AI wrapper.

The best mental model is:

- homepage = a cover page
- login/auth = a working surface with the same atmosphere
- app surfaces = practical tools shaped by the same restraint

## Non-Negotiable Principles

### 1. One strong idea per screen

Each screen should have one dominant idea.

Examples:

- landing page: the product promise
- login page: complete the sign-in task
- workspace page: continue the investigation

If multiple sections are competing for attention, the page is probably too busy.

### 2. Typography does most of the work

Keen should get much of its personality from type, spacing, and proportion rather than decorative UI devices.

Prefer:

- strong headline scale
- careful line length
- disciplined spacing
- quiet contrast

Avoid:

- decorative pills
- excessive iconography
- heavy card grids
- stacked marketing sections that all say the same thing

### 3. Atmosphere should be subtle

Backgrounds can carry a very soft atmospheric wash, usually in the `blizzard` family of pale blue-whites.

That atmosphere should:

- support the typography
- make the page feel slightly more composed than flat white
- remain subtle enough that the content still feels primary

It should not become:

- a loud gradient hero
- a colorful illustration substitute
- a visual centerpiece fighting the text

### 4. Interfaces should stay low-chrome

Keen should avoid unnecessary framing.

Default posture:

- no cards by default
- no hero cards by default
- no boxed central container unless the interaction truly needs it
- no thick shadows or ornamental borders

Use enclosure only when it helps the task.

### 5. Product copy should be outcome-first

Write about the work the product helps the user do.

Prefer:

- research
- exploration
- continuity
- understanding
- branching

Avoid:

- AI hype
- assistant/copilot language
- generic “unlock your productivity” copy
- vague abstractions with no product meaning

## Typography Rules

### Primary display face: `Fraunces`

Use `Fraunces` for:

- the wordmark
- major landing-page headlines
- major auth-page headlines
- selective section headings that need gravitas

Traits:

- generous size
- tight tracking
- compact line-height
- sparing use

`Fraunces` should create authority, not ornament.

### Default utility/body face: `Satoshi`

Use `Satoshi` for:

- UI copy
- form labels
- buttons
- supporting text
- status/error/success messages
- practical app surfaces

This is the default product voice.

### Optional editorial support face: `Newsreader`

Use `Newsreader` only when there is a specific editorial reason:

- longer-form reading surfaces
- a small amount of atmospheric support copy
- places where softer literary texture genuinely helps

Do not force `Newsreader` onto normal UI text or forms.

If in doubt, prefer `Satoshi`.

## Color And Surface Rules

### Default tone

The baseline light atmosphere should stay in the `blizzard` family:

- near-white base
- pale blue wash
- blue-gray text accents
- restrained dark CTA contrast

### Surface behavior

Prefer:

- pale backgrounds
- translucent or lightly tinted white inputs
- subtle borders
- dark text and dark CTA buttons

Avoid:

- saturated accents
- multiple competing colors
- thick outlines
- dramatic gradients
- heavy shadow stacks

### Practical implementation note

For pages where visual stability matters, use explicit light values rather than depending entirely on theme token blending.

This is especially useful on landing and auth pages where the atmosphere needs to be dependable and quiet.

## Layout Rules

### Header

Headers should be simple and full-width.

Default:

- wordmark on the left
- one secondary action on the right, or nothing
- items sit near the true page edges, not clustered in a narrow central container

Avoid:

- crowded header controls
- multiple competing actions
- nav bars that feel heavier than the page itself

### Content width

Keep the main text measure narrow.

Good default ranges:

- hero copy: narrow and centered
- auth/task forms: around `26rem` wide
- supporting body copy: readable, not sprawling

### Whitespace

Use whitespace to create seriousness.

Do not rush to “fill” empty space with:

- feature blocks
- decorative cards
- secondary taglines
- product screenshots that are not necessary

## Component Guidance

### Buttons

Primary buttons should feel firm and simple.

Prefer:

- dark fill
- light text
- rounded-full or softly rounded corners
- no extra icon unless it improves clarity

### Inputs

Inputs should feel precise, not bulky.

Prefer:

- slightly shorter height than typical default SaaS forms
- soft rounding
- thin borders
- gentle focus ring
- low visual noise

Avoid:

- oversized padded fields
- thick outlines
- dark form surfaces on light pages

### Alerts And Messaging

Errors and success states should appear inline and stay restrained.

They should be readable, but not louder than the task itself.

## Page Archetypes

### 1. Cover page

Use for the marketing homepage.

Rules:

- one centered idea
- one clear CTA
- minimal header
- no product snippet unless absolutely necessary
- no feature grid by default

### 2. Task page

Use for login and similar focused flows.

Rules:

- same atmosphere as the homepage
- tighter column
- more practical spacing
- supporting text in a simpler, clearer voice
- the form becomes the main object

### 3. Workspace page

Use for the product itself.

Rules:

- keep the restraint
- increase utility density carefully
- prioritize orientation, reading flow, and working state
- do not convert the app into a mosaic of cards

Internal pages can be more practical than the homepage, but they should still feel like they belong to the same product.

## Copy Guidance

Keen copy should sound:

- clear
- serious
- contemporary
- lightly editorial

It should not sound:

- breathless
- mystical
- overbranded
- “AI-native”
- startup-demo polished

Good copy tends to be:

- short
- specific
- outcome-first
- free of jargon

## What Future Agents Should Avoid

Do not reintroduce:

- hero cards
- dashboard-card landing pages
- floating product mockups by default
- generic feature strips
- pill-heavy interface chrome
- glassmorphism
- oversized shadows
- multi-accent palettes
- assistant/copilot language when designing research-facing surfaces

If a proposal starts to look like “normal AI SaaS,” it is probably wrong for Keen.

## Current Reference Surfaces

Use these files as concrete examples of the current direction:

- `frontend/app/page.tsx`
- `frontend/app/login/page.tsx`

These are not the whole design system, but they are the clearest current examples of the desired tone.

## Agent Checklist

Before shipping a new UI surface, check:

1. Is there one dominant idea on the screen?
2. Could the page work with less chrome?
3. Are cards being used only when they are truly necessary?
4. Is the typography carrying enough of the visual identity?
5. Does the page feel like a serious research tool rather than a generic AI product?
6. Are the actions minimal and clearly prioritized?
7. Is the background atmospheric but still subordinate to the content?
8. If this were reduced by 20%, would it likely get better? If yes, reduce it.

## When To Deviate

Deviation is fine when the task genuinely requires it.

Examples:

- dense workspace controls
- tables or inspectors
- source-heavy research views
- more explicit status surfaces

But even then:

- keep the palette restrained
- keep type hierarchy strong
- keep chrome low
- avoid adding decorative complexity

The rule is not “everything must look like the homepage.”

The rule is:

**everything should feel like it belongs to the same calm, editorial, research-first product.**

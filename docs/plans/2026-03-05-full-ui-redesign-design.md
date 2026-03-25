# Full UI Redesign - Design Document

**Date:** 2026-03-05
**Branch:** ui-updates
**Status:** Approved

---

## Problem

The current Keen UI looks like a generic AI chat wrapper. It needs a distinct identity that reflects what Keen actually is: a voice-first thinking partner that knows you deeply, with calm confidence and quiet authority.

## Design Direction

**Editorial Presence + Spatial Calm** - A hybrid approach combining editorial typography and conversation flow with generous spacing and minimal chrome. The result should feel like Perplexity's content-first professionalism crossed with the warmth of a personal workspace, without any yellow tint.

### Core Identity Principles

1. **Memory/depth is visible.** The UI conveys that this tool knows you. Memory surfaces contextually, not hidden away.
2. **Voice-first by nature.** The mic/voice experience is woven into the UI's fabric, not a button bolted onto a chat interface.
3. **Calm confidence.** Quiet authority. A serious, trusted tool. Not flashy, not a demo.

---

## Visual Language

### Typography

| Role | Font | Usage |
|------|------|-------|
| Display/Headings | **Fraunces** (variable, optical sizing) | Page titles, "Talking With" name, empty-state headlines, mentor names |
| Body | **Satoshi** | Message content, labels, buttons, all UI text |
| Mono | **JetBrains Mono** | Code blocks in responses |

Load via `next/font`. No Rubik. No Inter.

### Color Palette

**Light mode:**

| Token | Value | Usage |
|-------|-------|-------|
| Background | `#f8f8f6` | Page background (cool cream, no yellow cast) |
| Surface | `#ffffff` | Cards, panels, inputs |
| Text | `#1c1917` | Primary text (stone-900) |
| Muted | `#78716c` | Secondary text (stone-500) |
| Accent (Keen) | `#64748B` | Default accent, calm slate |
| Border | shadow-only | No visible borders except where functionally needed |

**Dark mode:**

| Token | Value | Usage |
|-------|-------|-------|
| Background | `#0d0d0c` | Page background (neutral dark, slight warmth) |
| Surface | `#181817` | Cards, panels |
| Text | `#e7e5e4` | Primary text (stone-200) |
| Muted | `#78716c` | Secondary text |
| Border | `rgba(255,255,255,0.05)` | Subtle dividers where needed |

### Texture & Atmosphere

- Subtle grain overlay (current approach, dialed down further)
- No gradients on surfaces. Gradients only for ambient effects (voice active, loading)
- Shadow-defined hierarchy: surfaces differentiated by elevation, not borders
- Rounded corners: 12px for cards/panels, 8px for buttons/inputs, full for dots/avatars

### Spacing & Grid

- **Strict 4px grid.** Every margin, padding, and gap is a multiple of 4.
- Scale: `4, 8, 12, 16, 20, 24, 32, 40, 48, 64`
- **Typography scale:** `12, 14, 16, 20, 24, 32` px only. No freeform values like `[11px]` or `[13px]`.
- **Icon size:** 20px consistently throughout.

---

## Layout Architecture

### Page Structure

- **Conversation column:** `max-w-2xl` (672px), centered. Narrower than current `max-w-3xl` for more negative space on sides.
- **Header:** Full width, single row, 64px height. "Talking With" + mentor name on left. Navigation icons on right.
- **Input zone:** Bottom of screen. Voice waveform line above text input. Unified area.
- **Context strip:** Below the input. Single line showing relevant memories for the current conversation. Muted text. Only shows when context exists.
- **No floating/absolute decorative elements.** Everything on the grid.

### Header Layout

```
 [hamburger]  Talking With              [mentors] [theme]
              dot  Mentor Name
```

- Left: Hamburger (opens conversation panel) + talking-with label + mentor name with accent dot
- Right: Grid icon (navigates to /mentors) + Theme toggle
- All icons: 20px, aligned to grid

---

## Conversation UI

### Message Design

No chat bubbles. No background colors on messages. Editorial typographic separation.

- **Role label:** Left-aligned. 12px uppercase tracking, muted color. Timestamp right-aligned on same line, even more muted.
- **Message body:** 16px Satoshi, `leading-relaxed` (1.625). Dark text. No background, no borders.
- **Message gap:** 32px vertical spacing between messages.
- **Memory references:** When Keen references something it remembers, that phrase gets a subtle underline or slightly different color.
- **Markdown rendering:** Current ReactMarkdown approach, updated with new typography.

### Empty State

- Fraunces heading, 32px: "What's on your mind?" (Keen) or "Talk to {mentor name}" (mentor)
- Satoshi body, 14px, muted: tagline or "Speak or type. I'm listening."
- Vertically centered in conversation area.

### Loading State

"Keen" role label, then three subtle bouncing dots at body text position. No separate container.

---

## Voice & Input Experience

### Unified Input Zone

The bottom of the screen has a single cohesive input area.

**Voice line:** A thin horizontal line (2px) spanning the input area width, above the text input.
- Idle: Flat, muted line (stone-300 light / stone-700 dark)
- Listening: Animated waveform responding to audio amplitude, slightly more prominent color
- Processing: Smooth shimmer/pulse animation

**Text input:** Below the voice line. Clean textarea, flat background matching page surface with subtle shadow. No glass effects. Placeholder: "Message {name}..."

**Send button:** Inside the input, right-aligned. Small circle with up-arrow. Only visible when text is present.

**Mic activation:** No separate prominent mic button. A small, subtle mic icon integrated into the left side of the input area toggles voice. Or tap/click the voice line itself.

### Voice Active State

- Voice line animates as waveform
- Green dot + "Listening" label below input
- Transcript preview above input area (clean, no glass - muted text on page background)
- Text input placeholder changes to "Listening..."

### TTS Playback

- "Speaking..." label below input
- Voice line does gentle slow pulse (smooth sine, different from listening waveform)
- Speaking while Keen talks interrupts (current behavior)

---

## Navigation & Side Panel

### Side Panel (left slide-over)

Opens via hamburger icon. Contains:

1. **"Conversations" heading** + close button
2. **"New Chat" button** - full-width, outlined, 40px height
3. **Conversation list** - each item: accent dot + mentor name + timestamp (line 1), preview text (line 2). 48px height per item, 16px horizontal padding.
4. **Divider**
5. **"Memories" link** at bottom - tappable, navigates to `/memory` page. Just a text link, no inline memory preview.

**Execution:** Solid background (`#f8f8f6` light / `#131312` dark). No glass/blur. Tight grid-aligned spacing.

### Navigation Model

- Hamburger: conversation panel (left slide-over)
- Grid icon: navigates to `/mentors`
- Theme toggle: light/dark mode
- "Memories" link in side panel: navigates to `/memory`

---

## Mentor Identity

### Visual Differentiation

The sole visual differentiator between mentors is **accent color**, used in:
- The dot next to the mentor name in the header
- The voice line color when talking to that mentor
- Mentor cards on `/mentors`

Everything else (layout, spacing, typography, background, input design) stays identical across mentors. Personality comes through conversation content.

### Mentors Page (`/mentors`)

- Grid of cards: flat white surface, clean shadow (`0 1px 3px rgba(0,0,0,0.05)`). Border only on hover.
- Top accent line per card: 2px, using mentor accent color.
- Mentor name in Fraunces, tagline in Satoshi.
- Avatar: circle with initials fallback (current approach).
- "Create Mentor" card: dashed border, current approach with tighter spacing.
- Customize button: hover-reveal on card (current approach).

---

## Memory

### Context Strip (inline)

Below the input zone. Shows relevant memories for the current conversation as a single muted line. Only appears when context exists.

### Memory Page (`/memory`) - new

- Header: back arrow + "Memories" heading (same pattern as /mentors header)
- Long-term memories organized by category
- Daily notes organized by date
- Each entry is editable/deletable (reuses current MemoryEntry component logic)
- Clean list layout, no cards. Text entries with category labels.

---

## Pages Summary

| Page | Status | Key Changes |
|------|--------|-------------|
| `/home` | Redesign | New typography, layout, input zone, message style, spacing |
| `/mentors` | Redesign | Crisper cards, typography update, spacing grid |
| `/memory` | **New** | Dedicated memory browsing page |
| `/login` | Light touch | Typography + color update, same structure |

---

## Global Execution Standards

1. **No glass/blur effects** on interactive elements (input, buttons, panels)
2. **No freeform pixel values** - strict 4px grid and modular type scale
3. **Shadow-defined hierarchy** - surfaces differentiated by elevation, not borders
4. **Consistent icon sizing** - 20px throughout
5. **Typography pairing** - Fraunces for headings, Satoshi for everything else
6. **Color consistency** - cool cream background, no yellow cast
7. **Flat surfaces** - clean, precise shadows only

---

## Out of Scope

- Dashboard/home view (Approach C) - not pursuing
- Per-mentor background themes or layout changes
- Tab-based navigation
- Persistent sidebar (slide-over only)
- Mobile app considerations

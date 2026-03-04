---
name: frontend-design
description: Create distinctive, production-ready frontend visual directions and UI implementations for web apps. Use when tasks involve landing pages, dashboards, marketing sites, component styling, redesigns, design-system theming, or requests to improve visual quality with stronger typography, color systems, layout, motion, and responsive behavior.
---

# Frontend Design

## Overview

Design and implement intentional frontend interfaces that avoid generic defaults. Drive from one clear visual direction, then ship responsive and accessible UI code that fits either a new concept or an existing design system.

## Workflow

### 1) Frame the Design Brief

- Extract goal, target user, primary action, and desired tone from the request.
- Identify hard constraints first: framework, existing components, brand requirements, browser/device targets, and deadlines.
- If details are missing, proceed with explicit assumptions and keep them minimal.

### 2) Select One Visual Direction

- Choose one dominant art direction before writing code.
- Use a direction from `references/style-directions.md`.
- Commit to a clear typography hierarchy, color story, and spacing rhythm.
- Avoid bland defaults unless the existing system requires them:
  - Do not default to Inter, Roboto, Arial, or system stacks by habit.
  - Do not rely on flat single-color backgrounds.
  - Do not default to purple-centric palettes unless requested.

### 3) Build Tokens First

- Define CSS variables or theme tokens before component-level styles.
- Include at least:
  - Color tokens: background, surface, text, muted text, accent, border.
  - Typography tokens: display, heading, body, and optional mono.
  - Spacing, radius, shadow, and motion tokens.
- Prefer semantic names (`--color-surface-1`, `--text-primary`) over raw hue names.

### 4) Compose Layout and Core Components

- Build hierarchy intentionally: hero anchor, section cadence, and clear call-to-action path.
- Reuse component patterns for nav, cards, actions, and content blocks.
- Use contrast in scale, weight, and density to guide attention.
- Keep line lengths readable and vertical rhythm consistent.

### 5) Add Meaningful Motion and Atmosphere

- Add a few purposeful animations:
  - Page-load reveal.
  - Staggered entrance for grouped content.
  - One interaction transition for a primary control.
- Keep motion subtle and quick.
- Use layered backgrounds (gradients, textures, or geometric overlays) to avoid flatness.

### 6) Verify Responsive and Accessible Behavior

- Validate layout behavior on desktop and mobile explicitly.
- Ensure keyboard focus visibility and usable tab order.
- Verify readable type sizes and sufficient contrast.
- Respect reduced-motion preferences for non-essential effects.

### 7) Run a Design Quality Pass

- Confirm the UI feels intentional and specific to the product.
- Remove template-looking leftovers and unused style experiments.
- Check consistency across default, hover, active, focus, and disabled states.

## Working With Existing Systems

- Preserve established design systems when working in mature products.
- Extend existing tokens and components instead of replacing patterns wholesale.
- Introduce boldness through composition, hierarchy, and detail without breaking system rules.

## Output Expectations

- State the chosen visual direction.
- Summarize token strategy.
- Summarize responsive decisions and motion choices.
- List assumptions that materially affected design decisions.
- Reference modified files and key implementation points.

## References

- Use `references/style-directions.md` when selecting a visual direction and starter token set.

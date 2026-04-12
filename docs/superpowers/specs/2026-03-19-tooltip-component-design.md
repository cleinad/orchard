# Tooltip Component Design

## Overview

A reusable, slottable tooltip component built on the HTML Popover API (`popover="hint"`) and CSS anchor positioning. No JavaScript positioning logic, no portals, no third-party dependencies.

## API

```tsx
<Tooltip content="Browse mentors" side="bottom" delayShow={100} delayHide={100}>
  <button>...</button>
</Tooltip>
```

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `content` | `ReactNode` | required | Tooltip content (text or JSX). Should be descriptive, not interactive. |
| `side` | `"top" \| "bottom" \| "left" \| "right"` | `"bottom"` | Preferred placement side |
| `delayShow` | `number` | `100` | Milliseconds before tooltip appears on hover/focus |
| `delayHide` | `number` | `100` | Milliseconds before tooltip hides on leave/blur |
| `children` | `ReactElement` | required | The trigger element (slotted) |

While `content` accepts `ReactNode` for flexibility, it should contain only descriptive content (text, formatting). Interactive elements (buttons, links) inside the tooltip are unsupported — use a popover pattern instead.

## Behavior

### Slottable trigger

The component clones the single child element to merge in:
- `onPointerEnter` / `onPointerLeave` handlers
- `onFocus` / `onBlur` handlers
- A forwarded `ref`

No wrapper DOM is added around the trigger. The child element IS the anchor.

**Event handler merging**: when the child already has handlers for any of these events, the Tooltip composes them (calls the child's handler first, then its own). It never replaces existing handlers.

**Ref merging**: the Tooltip uses a callback ref that calls both its own internal ref and any existing ref on the child element.

**Requirement for component children**: if the child is a React component (not a plain HTML element), that component must forward its ref and spread remaining props onto its root DOM element. This is required for slotting to work.

### Anchoring

The tooltip uses `showPopover({ source: triggerElement })` to create an **implicit anchor reference** between the trigger and the popover. This eliminates the need for explicit `anchor-name` / `position-anchor` CSS properties or generated IDs. The trigger's DOM node (obtained via the merged ref) is passed as the `source`.

### Show/hide

- **Hover**: shows after `delayShow` ms on pointer enter, hides after `delayHide` ms on pointer leave.
- **Focus**: shows on keyboard focus, hides on blur. Same delays apply.
- **Persist on tooltip hover**: if the cursor moves from the trigger onto the tooltip itself, the hide timer is cancelled and the tooltip stays open. It hides when the cursor leaves the tooltip.
- **Escape key / light dismiss**: handled automatically by `popover="hint"` — no custom JS needed.
- **Auto-close other hints**: `popover="hint"` automatically closes other open hint popovers when a new one opens.
- Controlled via `showPopover({ source })` / `hidePopover()` on the popover element.

### Positioning

- The tooltip `<div>` uses `popover="hint"` for top-layer rendering with built-in light dismiss.
- Implicit anchor reference from `showPopover({ source })` — no explicit `anchor-name` needed.
- CSS `position-area` places the tooltip on the preferred `side` (set via a `data-side` attribute or CSS custom property).
- `position-try-fallbacks: flip-block` (for top/bottom) or `flip-inline` (for left/right) flips to the opposite side.
- Animation via `@starting-style` + `:popover-open` transition (~150ms opacity), with `display` and `overlay` in the transition list using `allow-discrete` for proper entry/exit.

### Accessibility

- The popover has `role="tooltip"`.
- The trigger gets `aria-describedby` pointing to the popover's ID.
- `popover="hint"` provides implicit `aria-details` when using `showPopover({ source })`.

## File structure

- `frontend/app/components/Tooltip.tsx` — `"use client"` React component
- `frontend/app/components/tooltip.css` — positioning, fallbacks, animation. Imported directly by the Tooltip component.

## Integration

Replace `title` attributes on the 3 icon buttons in `HomeHeader.tsx` (Browse mentors, Learning mode, Theme toggle) with `<Tooltip>` wrappers.

`ThemeToggle` must be refactored to use `forwardRef` and spread rest props onto its root `<button>`, so it can be slotted as a Tooltip child.

### Before

```tsx
<button title="Browse mentors">...</button>
```

### After

```tsx
<Tooltip content="Browse mentors">
  <button>...</button>
</Tooltip>
```

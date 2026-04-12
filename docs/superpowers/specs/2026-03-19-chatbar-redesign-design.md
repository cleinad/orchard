# Chatbar Redesign — Design Spec

## Problem

The current `ChatComposer` chatbar is visually clunky:

1. Excessive padding makes the input feel fat
2. Pill toggles (Voice Off, Live Search Auto) are dense and wordy
3. Inline helper text ("Lets the model decide when live search is needed") looks amateurish
4. Waveform bar above the input is useless when mic is inactive

## Design Direction

Perplexity-style minimal: tight rounded input, icons integrated, controls compact and unobtrusive.

## Changes

### 1. Input Bar — Slimmed Down

**Container padding reduction (two separate divs):**
- Outer centering div (line 80, `mx-auto w-full max-w-2xl px-6`): change `px-6` to `px-4`
- Inner spacing div (line 81, `shrink-0 pb-6 pt-2`): change `pb-6` to `pb-4`

**Input box:** `rounded-lg px-3 py-1.5` (from `rounded-xl px-4 py-2`)

**Layout change:**
- Left side: Textarea only — placeholder stays dynamic (`Message ${activeName}...`)
- Right side: Mic button + Send button, tightly grouped with `gap-1.5`
- Both buttons: `p-1.5 rounded-md` (from `p-2 rounded-lg`), icon size `h-4 w-4`
- Send button keeps its filled style (`bg-foreground text-background`) — it's the primary action

**Mic button moves** from left side to right side, grouped with send button.
- Inactive: `text-muted/50`
- Active (recording): `text-foreground`

### 2. Waveform Visualization — Hidden by Default

- Default state: Completely hidden (no thin line visible)
- Mic active: Fades in above the input bar. Use `opacity` + `max-h` transition (`duration-300`) for smooth enter/exit. Expanded height stays at `h-0.5` (2px).
- No changes to the SVG polyline animation logic itself — only visibility gating
- **Loading shimmer** (currently inside waveform container, shown when `!micActive && isLoading`): remove. The shimmer is not useful enough to relocate.

**Visual stacking order when mic active:** transcript display -> waveform -> input bar -> toggle row -> warnings

### 3. Toggle Icons — Compact Icon Buttons Below Input

**Remove** the current pill toggles ("Voice Off", "Live Search Auto") and all inline helper/description text.

**Replace with** two icon-only toggle buttons below the input, bottom-left. Each button toggles between its two states on click, same behavior as today.

- Row layout: `gap-1.5`, aligned left
- Each button: `h-7 w-7 rounded-md`, icon `h-3.5 w-3.5`
- **Inactive state:** Outlined icon variant, `text-muted/50`, hover `text-muted`
- **Active state:** Filled icon variant, `text-foreground`, `bg-black/[0.04]` (dark: `bg-white/[0.06]`)

**Accessibility:** Each button must have `aria-pressed` (carried over from current pills) and `aria-label` (since visible text labels are removed).

**Tooltip on hover** using the existing `Tooltip` component (`frontend/app/components/Tooltip.tsx`). Content as plain string:
- Voice (off): "Voice — Currently off"
- Voice (on): "Voice — Text-to-speech for responses"
- Search (auto): "Live Search — Lets the model decide when search is needed"
- Search (always on): "Live Search — Always grounds replies with live web results"

### 4. Removed Elements

- Inline `searchHelperText` next to toggles — moved to tooltip
- Inline `searchSuccessMessage` ("Last reply grounded with X live source(s)") — removed
- Waveform bar visible when mic inactive — hidden
- Loading shimmer inside waveform container — removed

### 5. Preserved Elements

- Search warning (amber box) — stays, rendered below toggle row when present
- Mic permission error messages — stay
- TTS status indicators ("Generating voice...", "Speaking...") — stay
- Transcript display above input when mic active — stays

## Files

- `frontend/app/home/components/ChatComposer.tsx` — primary changes
- `frontend/app/home/page.tsx` — remove `searchHelperText` and `searchSuccessMessage` prop computation and passing (these props are no longer rendered)

# Chatbar Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Slim down the ChatComposer chatbar — reduce padding, replace wordy pill toggles with icon-only buttons + tooltips, hide waveform when mic inactive, move mic button to the right.

**Architecture:** All visual changes in `ChatComposer.tsx`, prop cleanup in `page.tsx`. Uses the existing `Tooltip` component for hover labels. No new components or files.

**Tech Stack:** React, Tailwind CSS, existing `Tooltip` component (`@/app/components/Tooltip`)

**Spec:** `docs/superpowers/specs/2026-03-19-chatbar-redesign-design.md`

---

### Task 1: Slim down container padding and input box

**Files:**
- Modify: `frontend/app/home/components/ChatComposer.tsx:80-81,137`

- [ ] **Step 1: Reduce outer wrapper padding**

In `ChatComposer.tsx`, change line 80 from:
```tsx
<div className="mx-auto w-full max-w-2xl px-6">
```
to:
```tsx
<div className="mx-auto w-full max-w-2xl px-4">
```

- [ ] **Step 2: Reduce inner wrapper bottom padding**

Change line 81 from:
```tsx
<div className="shrink-0 pb-6 pt-2">
```
to:
```tsx
<div className="shrink-0 pb-4 pt-2">
```

- [ ] **Step 3: Slim down the input box**

Change line 137 from:
```tsx
<div className="flex items-end gap-0 rounded-xl bg-surface px-4 py-2 shadow-sm ring-1 ring-black/[0.04] dark:ring-white/[0.06]">
```
to:
```tsx
<div className="flex items-end gap-0 rounded-lg bg-surface px-3 py-1.5 shadow-sm ring-1 ring-black/[0.04] dark:ring-white/[0.06]">
```

- [ ] **Step 4: Verify visually**

Run: `npm run dev` (or whatever the dev server command is) and confirm the chatbar looks tighter.

- [ ] **Step 5: Commit**

```bash
git add frontend/app/home/components/ChatComposer.tsx
git commit -m "style(chatbar): reduce container and input padding"
```

---

### Task 2: Move mic button to right side, shrink both buttons

**Files:**
- Modify: `frontend/app/home/components/ChatComposer.tsx:138-193`

- [ ] **Step 1: Remove mic button from left side**

Delete lines 138-161 (the entire mic button block before the textarea).

- [ ] **Step 2: Restructure right side — mic + send grouped**

Replace the current send button block (lines 175-193) with both buttons grouped in a flex container. The textarea and right-side buttons should look like:

```tsx
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(event) => onInputChange(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder={micActive ? 'Listening...' : `Message ${activeName}...`}
              disabled={isLoading}
              rows={1}
              className="w-full min-w-0 resize-none bg-transparent py-1.5 text-sm leading-relaxed text-foreground placeholder-muted/50 outline-none disabled:cursor-not-allowed disabled:opacity-50"
              style={{ maxHeight: '200px' }}
            />

            <div className="flex flex-shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={onToggleMic}
                disabled={isLoading}
                aria-label={micActive ? 'Stop microphone' : 'Start microphone'}
                className={`rounded-md p-1.5 transition-colors ${
                  micActive
                    ? 'text-foreground'
                    : 'text-muted/50 hover:text-muted'
                } disabled:cursor-not-allowed disabled:opacity-50`}
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
                  />
                </svg>
              </button>

              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="rounded-md bg-foreground p-1.5 text-background transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-20"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 10l7-7m0 0l7 7m-7-7v18"
                  />
                </svg>
              </button>
            </div>
```

- [ ] **Step 3: Verify visually**

Confirm mic and send buttons are on the right, tightly grouped. Mic toggle still works.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/home/components/ChatComposer.tsx
git commit -m "style(chatbar): move mic button to right, shrink buttons"
```

---

### Task 3: Hide waveform when mic inactive

**Files:**
- Modify: `frontend/app/home/components/ChatComposer.tsx:97-134`

- [ ] **Step 1: Add conditional visibility to waveform container**

Replace the waveform container (lines 97-134) with:

```tsx
        <div
          ref={waveformContainerRef}
          className={`relative mx-auto mb-1 h-0.5 max-w-[90%] overflow-hidden rounded-full transition-[opacity,max-height] duration-300 ${
            micActive
              ? 'max-h-4 opacity-100'
              : 'max-h-0 opacity-0'
          }`}
        >
          <svg
            viewBox="0 0 240 4"
            className="absolute inset-0 h-full w-full"
            preserveAspectRatio="none"
          >
            <polyline
              ref={waveformRef}
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
              points="0,2 240,2"
              className="text-muted transition-colors duration-300"
            />
            <polyline
              ref={waveformGlowRef}
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
              points="0,2 240,2"
              className="text-muted/40 opacity-50 transition-opacity duration-300"
              style={{ filter: 'blur(2px)' }}
            />
          </svg>
        </div>
```

This removes:
- The loading shimmer overlay (no longer needed)
- The inactive/active color branching on polylines (always shows mic-active style since container is hidden otherwise)

- [ ] **Step 2: Verify visually**

Waveform should be invisible by default. Toggle mic on — waveform should fade in smoothly. Toggle off — fades out.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/home/components/ChatComposer.tsx
git commit -m "style(chatbar): hide waveform bar when mic inactive"
```

---

### Task 4: Replace pill toggles with icon-only buttons + tooltips

**Files:**
- Modify: `frontend/app/home/components/ChatComposer.tsx:196-308`

- [ ] **Step 1: Add Tooltip import**

At the top of `ChatComposer.tsx`, add:

```tsx
import Tooltip from '@/app/components/Tooltip';
```

- [ ] **Step 2: Replace the toggle section**

Replace lines 196-308 (the entire toggles + helper text + warning + success message block) with:

```tsx
          <div className="mt-2 flex items-center gap-1.5 px-1">
            <Tooltip
              content={
                ttsEnabled
                  ? 'Voice — Text-to-speech for responses'
                  : 'Voice — Currently off'
              }
              side="bottom"
            >
              <button
                type="button"
                aria-pressed={ttsEnabled}
                aria-label={ttsEnabled ? 'Voice on' : 'Voice off'}
                onClick={onToggleTts}
                className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
                  ttsEnabled
                    ? 'bg-black/[0.04] text-foreground dark:bg-white/[0.06]'
                    : 'text-muted/50 hover:text-muted'
                }`}
              >
                <svg
                  className="h-3.5 w-3.5"
                  fill={ttsEnabled ? 'currentColor' : 'none'}
                  stroke="currentColor"
                  strokeWidth="1.8"
                  viewBox="0 0 24 24"
                >
                  {ttsEnabled ? (
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M11.25 5.25L6.75 9H4.5v6h2.25l4.5 3.75V5.25zm4.5 4.5a4.5 4.5 0 010 4.5m2.25-6.75a7.5 7.5 0 010 9"
                    />
                  ) : (
                    <>
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M11.25 5.25L6.75 9H4.5v6h2.25l4.5 3.75V5.25z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M15.75 9.75l4.5 4.5m0-4.5l-4.5 4.5"
                      />
                    </>
                  )}
                </svg>
              </button>
            </Tooltip>

            <Tooltip
              content={
                searchEnabled
                  ? 'Live Search — Always grounds replies with live web results'
                  : 'Live Search — Lets the model decide when search is needed'
              }
              side="bottom"
            >
              <button
                type="button"
                aria-pressed={searchEnabled}
                aria-label={searchEnabled ? 'Live search always on' : 'Live search auto'}
                onClick={onToggleSearch}
                disabled={isLoading}
                className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
                  searchEnabled
                    ? 'bg-black/[0.04] text-foreground dark:bg-white/[0.06]'
                    : 'text-muted/50 hover:text-muted'
                } disabled:cursor-not-allowed disabled:opacity-50`}
              >
                <svg
                  className="h-3.5 w-3.5"
                  fill={searchEnabled ? 'currentColor' : 'none'}
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M21 21l-4.35-4.35m1.85-5.15a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </button>
            </Tooltip>
          </div>

          {searchWarning && (
            <div className="mt-2 rounded-lg border border-amber-300/70 bg-amber-50 px-3 py-2 text-xs text-amber-900 shadow-sm dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
              {searchWarning}
            </div>
          )}
```

This removes:
- The pill toggle buttons with text labels
- The inline `searchHelperText` span
- The `searchSuccessMessage` block

- [ ] **Step 3: Verify visually**

Two small icon buttons below input. Hover each — tooltip appears. Click toggles filled/outlined state. Search warning still renders when present.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/home/components/ChatComposer.tsx
git commit -m "style(chatbar): replace pill toggles with icon buttons + tooltips"
```

---

### Task 5: Clean up props (ChatComposer + page.tsx)

**Files:**
- Modify: `frontend/app/home/components/ChatComposer.tsx:9-36,49-76`
- Modify: `frontend/app/home/page.tsx:414-422,484-486`

- [ ] **Step 1: Remove unused props from ChatComposerProps interface**

In `ChatComposer.tsx`, remove these lines from the `ChatComposerProps` interface:
```tsx
  searchHelperText: string;
  searchSuccessMessage: string | null;
```

- [ ] **Step 2: Remove from destructuring**

In the function signature, remove `searchHelperText` and `searchSuccessMessage` from the destructured props.

- [ ] **Step 3: Clean up page.tsx — remove prop computation**

In `page.tsx`, delete lines 414-422:
```tsx
  const searchModeHelper = searchEnabled
    ? 'Always grounds replies with current web results'
    : 'Lets the model decide when live search is needed';
  const lastSearchSuccessMessage =
    lastSearchState?.attempted && lastSearchState.status === 'success'
      ? `Last reply grounded with ${lastSearchState.resultCount} live ${
          lastSearchState.resultCount === 1 ? 'source' : 'sources'
        }`
      : null;
```

- [ ] **Step 4: Remove prop passing from page.tsx**

In the `<ChatComposer>` JSX in `page.tsx`, remove these two props:
```tsx
          searchHelperText={searchModeHelper}
          searchSuccessMessage={lastSearchSuccessMessage}
```

- [ ] **Step 5: Verify build**

Run: `npx next build` (or `npm run build`) to ensure no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/app/home/components/ChatComposer.tsx frontend/app/home/page.tsx
git commit -m "refactor(chatbar): remove unused searchHelperText and searchSuccessMessage props"
```

# Full UI Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign all Novus frontend pages with editorial typography (Fraunces + Satoshi), strict spacing grid, shadow-defined hierarchy, unified voice+text input, and a new /memory page.

**Architecture:** Replace Libre Baskerville + Rubik fonts with Fraunces + Satoshi. Update globals.css with new color tokens and spacing scale. Rewrite all component Tailwind classes to use strict 4px grid and modular type scale (12/14/16/20/24/32px). Remove glass/blur effects from interactive elements. Create new /memory page.

**Tech Stack:** Next.js 16, React 19, Tailwind CSS v4, next/font (Google + local), Supabase

**Design doc:** `docs/plans/2026-03-05-full-ui-redesign-design.md`

---

### Task 1: Install and Configure Fonts

**Files:**
- Create: `frontend/app/fonts/` (directory for Satoshi font files)
- Modify: `frontend/app/layout.tsx`
- Modify: `frontend/app/globals.css`

**Step 1: Download Satoshi font files**

Satoshi is not available via Google Fonts. Download from fontshare.com and place in `frontend/app/fonts/`.

Required files (WOFF2 format for web performance):
- `Satoshi-Regular.woff2` (400)
- `Satoshi-Medium.woff2` (500)
- `Satoshi-Bold.woff2` (700)
- `Satoshi-Variable.woff2` (variable, preferred if available)

Run: Download from https://api.fontshare.com/v2/css?f[]=satoshi@1&display=swap or use the Fontshare download page.

If downloading is not feasible, fall back to **Plus Jakarta Sans** from Google Fonts (available via `next/font/google`).

**Step 2: Update layout.tsx with new fonts**

Replace the current font imports:

```tsx
import type { Metadata } from "next";
import { Fraunces } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

const fraunces = Fraunces({
  variable: "--font-heading",
  subsets: ["latin"],
  display: "swap",
});

const satoshi = localFont({
  src: [
    { path: "./fonts/Satoshi-Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/Satoshi-Medium.woff2", weight: "500", style: "normal" },
    { path: "./fonts/Satoshi-Bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Novus",
  description: "Hands Off AI",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${fraunces.variable} ${satoshi.variable} antialiased`}>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var stored=localStorage.getItem('novus-theme');var prefers=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches;var isDark=stored==='dark'||(stored!=='light'&&prefers);document.documentElement.classList.toggle('dark',isDark);}catch(e){}})();`,
          }}
        />
        {children}
      </body>
    </html>
  );
}
```

If using Plus Jakarta Sans fallback instead of Satoshi:

```tsx
import { Fraunces, Plus_Jakarta_Sans } from "next/font/google";

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-body",
  subsets: ["latin"],
  display: "swap",
});
```

**Step 3: Update globals.css**

```css
@import "tailwindcss";

@custom-variant dark (&:where(.dark, .dark *));

:root {
  --background: #f8f8f6;
  --foreground: #1c1917;
  --surface: #ffffff;
  --muted: #78716c;
  --accent: #64748B;
  --border-subtle: rgba(0, 0, 0, 0.04);
}

.dark {
  --background: #0d0d0c;
  --foreground: #e7e5e4;
  --surface: #181817;
  --muted: #78716c;
  --accent: #64748B;
  --border-subtle: rgba(255, 255, 255, 0.05);
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-surface: var(--surface);
  --color-muted: var(--muted);
  --color-accent: var(--accent);
  --font-sans: var(--font-body);
}

body {
  background: var(--background);
  color: var(--foreground);
  font-family: var(--font-body), system-ui, sans-serif;
}

.font-heading {
  font-family: var(--font-heading), "Georgia", serif;
}
```

**Step 4: Verify fonts load correctly**

Run: `cd frontend && npm run dev`
Expected: Pages render with Fraunces headings and Satoshi body text. No FOUT.

**Step 5: Commit**

```bash
git add frontend/app/fonts/ frontend/app/layout.tsx frontend/app/globals.css
git commit -m "replace fonts: Fraunces headings + Satoshi body"
```

---

### Task 2: Update HomeBackground Component

**Files:**
- Modify: `frontend/app/home/components/HomeBackground.tsx`

**Step 1: Update colors in HomeBackground**

The cursor glow and ambient blobs need updated colors to match the new palette. Replace warm stone tones with cooler neutral tones.

```tsx
'use client';

import { useEffect, useRef } from 'react';

export default function HomeBackground() {
  const cursorGlowRef = useRef<HTMLDivElement | null>(null);
  const cursorFrameRef = useRef<number | null>(null);
  const cursorPosRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const glow = cursorGlowRef.current;
    if (!glow) return;

    const update = () => {
      cursorFrameRef.current = null;
      glow.style.setProperty('--cursor-x', `${cursorPosRef.current.x}px`);
      glow.style.setProperty('--cursor-y', `${cursorPosRef.current.y}px`);
    };

    const handleMove = (event: PointerEvent) => {
      cursorPosRef.current = { x: event.clientX, y: event.clientY };
      if (cursorFrameRef.current === null) {
        cursorFrameRef.current = requestAnimationFrame(update);
      }
    };

    cursorPosRef.current = {
      x: window.innerWidth * 0.5,
      y: window.innerHeight * 0.35,
    };
    update();

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerdown', handleMove);

    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerdown', handleMove);
      if (cursorFrameRef.current !== null) {
        cancelAnimationFrame(cursorFrameRef.current);
      }
    };
  }, []);

  return (
    <div ref={cursorGlowRef} className="pointer-events-none fixed inset-0">
      {/* Cursor glow - light */}
      <div
        className="absolute inset-0 opacity-100 transition duration-500 ease-out dark:opacity-0"
        style={{
          background:
            'radial-gradient(200px circle at var(--cursor-x, 50%) var(--cursor-y, 35%), rgba(120, 113, 108, 0.06), transparent 60%)',
        }}
      />
      {/* Cursor glow - dark */}
      <div
        className="absolute inset-0 opacity-0 transition duration-500 ease-out dark:opacity-100"
        style={{
          background:
            'radial-gradient(200px circle at var(--cursor-x, 50%) var(--cursor-y, 35%), rgba(120, 113, 108, 0.05), transparent 60%)',
        }}
      />

      {/* Ambient blobs - light */}
      <div className="absolute -left-40 -top-40 h-96 w-96 rounded-full bg-stone-200/20 blur-3xl dark:opacity-0" />
      <div className="absolute -bottom-32 -right-32 h-80 w-80 rounded-full bg-stone-100/30 blur-3xl dark:opacity-0" />

      {/* Ambient blobs - dark */}
      <div className="absolute -left-40 -top-40 h-96 w-96 rounded-full bg-stone-800/20 opacity-0 blur-3xl dark:opacity-100" />
      <div className="absolute -bottom-32 -right-32 h-80 w-80 rounded-full bg-stone-800/15 opacity-0 blur-3xl dark:opacity-100" />
    </div>
  );
}
```

**Step 2: Verify**

Run: `cd frontend && npm run dev`
Expected: Background glow is slightly cooler/more neutral. No yellow cast.

**Step 3: Commit**

```bash
git add frontend/app/home/components/HomeBackground.tsx
git commit -m "update HomeBackground with cooler neutral tones"
```

---

### Task 3: Redesign Home Page - Header

**Files:**
- Modify: `frontend/app/home/page.tsx`

This task updates ONLY the header section (lines ~533-576 in the current file). The header should be slim, single-row, 64px height, with consistent 20px icons.

**Step 1: Update the header JSX**

Find the `<header>` block and replace with:

```tsx
<header className="flex h-16 items-center justify-between">
  <div className="flex min-w-0 items-center gap-3">
    <button
      type="button"
      onClick={() => setSidePanelOpen(true)}
      aria-label="Open conversations"
      className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-muted transition hover:text-foreground"
    >
      <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
      </svg>
    </button>
    <div className="min-w-0">
      <p className="text-xs font-medium uppercase tracking-widest text-muted">
        Talking With
      </p>
      <div className="mt-1 flex items-center gap-2">
        <span
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: activeAccent }}
        />
        <span className="truncate font-heading text-xl text-foreground">
          {activeName}
        </span>
      </div>
    </div>
  </div>
  <div className="flex items-center gap-2">
    <button
      type="button"
      onClick={() => router.push('/mentors')}
      aria-label="Browse mentors"
      title="Browse mentors"
      className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-muted transition hover:text-foreground"
    >
      <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
      </svg>
    </button>
    <ThemeToggle />
  </div>
</header>
```

**Step 2: Update the root div and main wrapper**

Replace the outermost wrapper classes:

```tsx
<div className="relative h-screen overflow-hidden bg-background text-foreground">
```

Replace the main wrapper:

```tsx
<main className="relative mx-auto flex h-screen w-full max-w-2xl flex-col px-6">
```

Note: changed `max-w-3xl` to `max-w-2xl` and `px-4 sm:px-6` to `px-6`.

**Step 3: Remove the grain texture div**

Delete the grain texture `<div>` block (the SVG noise overlay). The design uses clean surfaces.

**Step 4: Remove the loading/error banner between header and conversation**

Keep the functionality but update classes to use the new color tokens:

```tsx
{(loadingLists || listError) && (
  <div className="mb-4 rounded-lg bg-surface px-4 py-2 text-xs text-muted shadow-sm">
    {loadingLists ? 'Loading chats and mentors...' : listError}
  </div>
)}
```

**Step 5: Verify header renders correctly**

Run: `cd frontend && npm run dev`
Expected: Header is slim (64px), icons are 20px, typography uses new fonts, background uses new color tokens.

**Step 6: Commit**

```bash
git add frontend/app/home/page.tsx
git commit -m "redesign home page header and layout wrapper"
```

---

### Task 4: Redesign Home Page - Conversation Area

**Files:**
- Modify: `frontend/app/home/page.tsx`

This task updates the conversation display: messages, empty state, and loading indicator.

**Step 1: Update the empty state**

Replace the empty state block (inside `messages.length === 0` conditional):

```tsx
<div className="flex h-full min-h-[50vh] flex-col items-center justify-center px-4">
  <div className="text-center">
    <h1 className="font-heading text-3xl text-foreground sm:text-4xl">
      {activeMentor ? `Talk to ${activeMentor.name}` : "What's on your mind?"}
    </h1>
    <p className="mt-4 max-w-md text-sm leading-relaxed text-muted">
      {activeMentor
        ? activeMentor.tagline
        : "Speak or type. I'm listening."}
    </p>
  </div>
</div>
```

Note: Removed the longer default tagline to be more concise.

**Step 2: Update message rendering**

Replace the messages map block with editorial-style messages:

```tsx
<div className="py-8">
  {messages.map((message) => (
    <div key={message.id} className="py-4">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-muted">
          {message.role === 'user' ? 'You' : activeName}
        </span>
        <span className="text-xs text-muted/60">
          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
      <div className="mt-2 text-base leading-relaxed text-foreground [&_p]:mb-4 [&_p:last-child]:mb-0 [&_ul]:mb-4 [&_ul]:ml-5 [&_ul]:list-disc [&_ol]:mb-4 [&_ol]:ml-5 [&_ol]:list-decimal [&_li]:mb-1 [&_code]:rounded [&_code]:bg-stone-100 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-sm [&_code]:text-stone-700 dark:[&_code]:bg-stone-800 dark:[&_code]:text-stone-300 [&_pre]:my-4 [&_pre]:rounded-lg [&_pre]:bg-stone-100 [&_pre]:p-4 dark:[&_pre]:bg-stone-800">
        <ReactMarkdown>{message.content}</ReactMarkdown>
      </div>
    </div>
  ))}

  {/* Loading indicator */}
  {isLoading && (
    <div className="py-4">
      <span className="text-xs font-medium uppercase tracking-wider text-muted">
        {activeName}
      </span>
      <div className="mt-2 flex items-center gap-1.5">
        <span className="h-2 w-2 animate-bounce rounded-full bg-muted/40" style={{ animationDelay: '0ms' }} />
        <span className="h-2 w-2 animate-bounce rounded-full bg-muted/40" style={{ animationDelay: '150ms' }} />
        <span className="h-2 w-2 animate-bounce rounded-full bg-muted/40" style={{ animationDelay: '300ms' }} />
      </div>
    </div>
  )}

  <div ref={messagesEndRef} />
</div>
```

Key changes:
- Timestamps added to each message (right-aligned)
- Role label and timestamp on same line with `justify-between`
- Typography uses `text-base` (16px) instead of `text-[15px]`
- Markdown styles use standard scale values: `text-sm` for code, `mb-4` for paragraphs
- 32px gap between messages (py-4 = 16px top + 16px bottom = 32px effective gap)

**Step 3: Update the conversation scroll container**

```tsx
<div
  ref={containerRef}
  onScroll={handleScroll}
  className="flex-1 overflow-y-auto pb-4 pr-2"
  style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(0,0,0,0.08) transparent' }}
>
```

Remove the `conversation-scroll` class and its associated `<style jsx>` CSS. Use inline scrollbar styling instead.

**Step 4: Verify conversation UI**

Run: `cd frontend && npm run dev`
Expected: Messages display with editorial layout - role labels + timestamps, no bubbles, clean 16px body text, generous spacing.

**Step 5: Commit**

```bash
git add frontend/app/home/page.tsx
git commit -m "redesign conversation UI with editorial message layout"
```

---

### Task 5: Redesign Home Page - Input Zone

**Files:**
- Modify: `frontend/app/home/page.tsx`

This task replaces the current glass-capsule input + separate mic button with the unified voice+text input zone.

**Step 1: Replace the entire input area**

Replace everything inside `<div className="sticky bottom-0 ...">` with:

```tsx
<div className="sticky bottom-0 pb-6 pt-2">
  {/* Live transcript preview */}
  {hasTranscript && !isLoading && (
    <div className="mb-3 rounded-lg bg-surface px-4 py-2 text-sm text-muted shadow-sm">
      <span className="text-xs font-medium uppercase tracking-wider text-muted/60">Listening</span>
      <p className="mt-1">
        {transcription.finalTranscript}
        {transcription.interimTranscript && (
          <span className="text-muted/50"> {transcription.interimTranscript}</span>
        )}
        <span className="ml-1 inline-block h-4 w-0.5 animate-pulse bg-muted/50" />
      </p>
    </div>
  )}

  {/* Voice waveform line - always visible */}
  <div className="relative mx-auto mb-1 h-0.5 max-w-[90%] overflow-hidden rounded-full">
    <svg
      viewBox="0 0 240 4"
      className="absolute inset-0 h-full w-full"
      preserveAspectRatio="none"
    >
      <polyline
        ref={visualization.lineRef}
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        points="0,2 240,2"
        className={`transition-colors duration-300 ${
          micActive ? 'text-muted' : 'text-muted/30'
        }`}
      />
      <polyline
        ref={visualization.glowRef}
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        points="0,2 240,2"
        className={`transition-opacity duration-300 ${
          micActive ? 'text-muted/40 opacity-50' : 'opacity-0'
        }`}
        style={{ filter: 'blur(2px)' }}
      />
    </svg>
    {/* Shimmer loader when processing */}
    {!micActive && isLoading && (
      <div
        className="absolute inset-0 animate-shimmer bg-gradient-to-r from-stone-200 via-stone-300 to-stone-200 dark:from-stone-700 dark:via-stone-500 dark:to-stone-700"
        style={{ backgroundSize: '200% 100%' }}
      />
    )}
  </div>

  {/* Input area */}
  <form onSubmit={handleSubmit} className="relative">
    <div className="flex items-end gap-0 rounded-xl bg-surface px-4 py-2 shadow-sm ring-1 ring-black/[0.04] dark:ring-white/[0.06]">
      {/* Mic toggle - subtle, integrated */}
      <button
        type="button"
        onClick={toggleMic}
        disabled={isLoading}
        className={`mr-3 flex-shrink-0 rounded-lg p-2 transition-colors ${
          micActive
            ? 'text-foreground'
            : 'text-muted/50 hover:text-muted'
        } disabled:cursor-not-allowed disabled:opacity-50`}
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
        </svg>
      </button>

      {/* Text input */}
      <textarea
        ref={textareaRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={micActive ? 'Listening...' : `Message ${activeName}...`}
        disabled={isLoading}
        rows={1}
        className="w-full min-w-0 resize-none bg-transparent py-1.5 text-sm leading-relaxed text-foreground placeholder-muted/50 outline-none disabled:cursor-not-allowed disabled:opacity-50"
        style={{ maxHeight: '200px' }}
      />

      {/* Send button */}
      <button
        type="submit"
        disabled={!input.trim() || isLoading}
        className="ml-2 flex-shrink-0 rounded-lg bg-foreground p-2 text-background transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-20"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
        </svg>
      </button>
    </div>
  </form>

  {/* Status line */}
  <div className="mt-2 flex items-center justify-between px-4 text-xs text-muted/60">
    <div className="flex items-center gap-3">
      {micActive && (
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
          <span>
            {transcription.status === 'connected' ? 'Listening' : transcription.status === 'connecting' ? 'Connecting...' : 'Ready'}
          </span>
        </span>
      )}
      {tts.isLoading && <span>Generating voice...</span>}
      {tts.isPlaying && <span>Speaking...</span>}
    </div>
    <span className="hidden sm:inline">
      Enter to send
    </span>
  </div>

  {/* Mic errors */}
  {microphone.status === 'blocked' && (
    <p className="mt-2 text-center text-xs text-muted">
      Microphone permission denied. Check browser settings.
    </p>
  )}
  {microphone.status === 'error' && microphone.errorMessage && (
    <p className="mt-2 text-center text-xs text-rose-500">{microphone.errorMessage}</p>
  )}
</div>
```

**Step 2: Remove the MicDodecahedron component**

Delete the `MicDodecahedron` function component (lines ~34-55 in current file). It's no longer used.

**Step 3: Remove all `<style jsx>` blocks**

Delete the entire `<style jsx>` block at the bottom of the component. This removes:
- `.animate-shimmer` keyframe (move to globals.css)
- `.input-glass-capsule` styles
- `.input-glass-orb` styles
- `.conversation-scroll` scrollbar styles
- `.input-glass-capsule textarea` scrollbar styles

Add to globals.css instead:

```css
@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.animate-shimmer {
  animation: shimmer 2s linear infinite;
}
```

**Step 4: Verify input zone**

Run: `cd frontend && npm run dev`
Expected: Unified input zone with voice line above, mic icon on left inside the input, text input, send button on right. No glass effects. Clean flat surface.

**Step 5: Commit**

```bash
git add frontend/app/home/page.tsx frontend/app/globals.css
git commit -m "redesign input zone: unified voice line + text, no glass effects"
```

---

### Task 6: Redesign Side Panel

**Files:**
- Modify: `frontend/app/home/components/SidePanel.tsx`

**Step 1: Rewrite SidePanel component**

Replace the entire component. Key changes:
- Solid background, no blur
- Conversations only in the list
- "Memories" as a simple link at the bottom
- Remove all memory display logic (entries, categories, daily notes)
- Remove `useMemory` hook import
- Remove `MemoryEntry` import
- Remove memory-related state and effects
- Grid-aligned spacing throughout

```tsx
'use client';

import { useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { ConversationListItem } from './ConversationsPanel';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  conversations: ConversationListItem[];
  activeConversationId: string | null;
  onSelectConversation: (conversation: ConversationListItem) => void;
  onNewNovusChat: () => void;
}

function formatDate(input: string): string {
  const date = new Date(input);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function SidePanel({
  isOpen,
  onClose,
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewNovusChat,
}: Props) {
  const router = useRouter();

  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, handleEscape]);

  return (
    <div
      className={`fixed inset-0 z-40 transition-all duration-300 ${
        isOpen ? 'pointer-events-auto' : 'pointer-events-none'
      }`}
    >
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/10 transition-opacity duration-300 dark:bg-black/40 ${
          isOpen ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={onClose}
      />

      {/* Panel */}
      <aside
        className={`absolute left-0 top-0 h-full w-[380px] max-w-[85vw] transform transition-transform duration-300 ease-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-full flex-col bg-background shadow-xl dark:bg-[#131312]">
          {/* Header */}
          <div className="flex h-16 items-center justify-between px-6">
            <h2 className="font-heading text-xl text-foreground">
              Conversations
            </h2>
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-muted transition-colors hover:text-foreground"
              aria-label="Close"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* New Chat button */}
          <div className="px-4 pb-4">
            <button
              type="button"
              onClick={() => {
                onNewNovusChat();
                onClose();
              }}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-lg text-sm font-medium text-muted ring-1 ring-black/[0.06] transition-colors hover:text-foreground dark:ring-white/[0.08]"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              New Chat
            </button>
          </div>

          {/* Divider */}
          <div className="mx-6 h-px bg-black/[0.06] dark:bg-white/[0.06]" />

          {/* Conversations list */}
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2" style={{ scrollbarWidth: 'none' }}>
            {conversations.length === 0 ? (
              <div className="px-4 py-12 text-center text-sm text-muted">
                No conversations yet.
              </div>
            ) : (
              conversations.map((conversation) => {
                const isActive = activeConversationId === conversation.id;
                const accent = conversation.mentor_accent_color || '#94a3b8';
                return (
                  <button
                    key={conversation.id}
                    type="button"
                    onClick={() => {
                      onSelectConversation(conversation);
                      onClose();
                    }}
                    className={`group w-full rounded-lg px-4 py-3 text-left transition-colors duration-150 ${
                      isActive
                        ? 'bg-foreground/[0.04]'
                        : 'hover:bg-foreground/[0.02]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className="h-2 w-2 flex-shrink-0 rounded-full"
                          style={{ backgroundColor: accent }}
                        />
                        <span className="truncate text-sm font-medium text-foreground">
                          {conversation.mentor_name}
                        </span>
                      </div>
                      <span className="flex-shrink-0 text-xs text-muted/60">
                        {formatDate(conversation.updated_at)}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 pl-4 text-xs leading-snug text-muted/70">
                      {conversation.preview || conversation.title || 'No messages yet'}
                    </p>
                  </button>
                );
              })
            )}
          </div>

          {/* Footer - Memories link */}
          <div className="border-t border-black/[0.06] px-6 py-4 dark:border-white/[0.06]">
            <button
              type="button"
              onClick={() => {
                router.push('/memory');
                onClose();
              }}
              className="flex w-full items-center justify-between text-sm text-muted transition-colors hover:text-foreground"
            >
              <span>Memories</span>
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5-7.5M21 12H3" />
              </svg>
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
```

**Step 2: Verify side panel**

Run: `cd frontend && npm run dev`
Expected: Clean side panel with solid background, conversation list, "Memories" link at bottom. No glass effects, no inline memories.

**Step 3: Commit**

```bash
git add frontend/app/home/components/SidePanel.tsx
git commit -m "redesign side panel: conversations only, memories link at bottom"
```

---

### Task 7: Create Memory Page

**Files:**
- Create: `frontend/app/memory/page.tsx`

**Step 1: Create the memory page**

```tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import ThemeToggle from '@/app/components/ThemeToggle';
import HomeBackground from '@/app/home/components/HomeBackground';
import MemoryEntryComponent from '@/app/home/components/MemoryEntry';
import { useMemory } from '@/app/home/components/useMemory';
import { MEMORY_CATEGORIES, CATEGORY_HEADINGS, type MemoryCategory } from '@/lib/memory-types';

function formatMemoryDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = today.getTime() - date.getTime();
  const days = Math.round(diff / (1000 * 60 * 60 * 24));

  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function MemoryPage() {
  const router = useRouter();
  const { entries, loading, load, updateEntry, deleteEntry } = useMemory();

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace('/login');
        return;
      }
      load();
    }
    void init();
  }, [router, load]);

  const longTermByCategory = MEMORY_CATEGORIES.map((cat) => ({
    category: cat,
    heading: CATEGORY_HEADINGS[cat as MemoryCategory],
    entries: entries.filter((e) => e.type === 'long-term' && e.category === cat),
  })).filter((group) => group.entries.length > 0);

  const dailyByDate = entries
    .filter((e) => e.type === 'daily')
    .reduce(
      (acc, entry) => {
        const date = entry.date || 'Unknown';
        if (!acc[date]) acc[date] = [];
        acc[date].push(entry);
        return acc;
      },
      {} as Record<string, typeof entries>
    );

  const dailyDates = Object.keys(dailyByDate).sort((a, b) => b.localeCompare(a));

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <HomeBackground />

      <div className="relative mx-auto max-w-3xl px-6">
        {/* Header */}
        <header className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.push('/home')}
              aria-label="Back to chat"
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-muted transition hover:text-foreground"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
            </button>
            <h1 className="font-heading text-2xl text-foreground">
              Memories
            </h1>
          </div>
          <ThemeToggle />
        </header>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-32">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted/20 border-t-muted" />
          </div>
        ) : entries.length === 0 ? (
          <div className="py-20 text-center">
            <p className="text-sm text-muted">
              No memories yet. Novus will remember things as you chat.
            </p>
          </div>
        ) : (
          <div className="pb-12">
            {/* Long-term memories by category */}
            {longTermByCategory.map((group) => (
              <div key={group.category} className="mb-8">
                <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted">
                  {group.heading}
                </h2>
                <div className="space-y-1">
                  {group.entries.map((entry) => (
                    <MemoryEntryComponent
                      key={`${entry.fileId}-${entry.entryIndex}`}
                      entry={entry}
                      onUpdate={updateEntry}
                      onDelete={deleteEntry}
                    />
                  ))}
                </div>
              </div>
            ))}

            {/* Daily notes by date */}
            {dailyDates.length > 0 && (
              <div className="mb-8">
                <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted">
                  Recent Notes
                </h2>
                {dailyDates.map((date) => (
                  <div key={date} className="mb-4">
                    <p className="mb-2 text-xs text-muted/70">
                      {formatMemoryDate(date)}
                    </p>
                    <div className="space-y-1">
                      {dailyByDate[date].map((entry) => (
                        <MemoryEntryComponent
                          key={`${entry.fileId}-${entry.entryIndex}`}
                          entry={entry}
                          onUpdate={updateEntry}
                          onDelete={deleteEntry}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Verify memory page**

Run: `cd frontend && npm run dev`
Navigate to `/memory`.
Expected: Clean page with back arrow, "Memories" heading, categorized memory entries.

**Step 3: Commit**

```bash
git add frontend/app/memory/page.tsx
git commit -m "add dedicated /memory page"
```

---

### Task 8: Redesign Mentors Page

**Files:**
- Modify: `frontend/app/mentors/page.tsx`

**Step 1: Update page wrapper and header**

Replace background color references:
- `bg-[#faf9f6]` → `bg-background`
- `dark:bg-[#0c0c0b]` → (handled by bg-background in dark mode)
- `text-stone-900` → `text-foreground`
- `dark:text-stone-100` → (handled by text-foreground)

Remove the grain texture div.

Update header to match the new pattern (h-16 height, consistent icon sizes).

**Step 2: Update mentor cards**

Replace the card classes. Remove `mentor-card` custom class and `<style jsx>` block. Use:

```tsx
<button
  key={mentor.id}
  type="button"
  onClick={() => router.push(`/home?mentor=${mentor.slug}`)}
  className="group relative rounded-xl bg-surface p-5 text-left shadow-sm ring-1 ring-black/[0.04] transition-all duration-200 hover:shadow-md hover:ring-black/[0.06] dark:ring-white/[0.06] dark:hover:ring-white/[0.08]"
>
```

Update the accent bar from 1px to 2px:
```tsx
<div
  className="absolute left-5 right-5 top-0 h-0.5"
  style={{ backgroundColor: accentTint(accent, 0.3) }}
/>
```

Update mentor name to use heading font:
```tsx
<span className="truncate font-heading text-base text-foreground">
  {mentor.name}
</span>
```

Update tagline and description text sizes to use standard scale:
- Tagline: `text-xs` (12px)
- Description: `text-xs` (12px)

**Step 3: Update create mentor card**

```tsx
<button
  type="button"
  onClick={() => setCreateOpen(true)}
  className="group flex flex-col items-center justify-center rounded-xl border border-dashed border-muted/30 p-8 text-center transition-colors hover:border-muted/50 hover:bg-surface/50"
>
```

**Step 4: Remove `<style jsx>` block entirely**

Delete the mentor-card shadow CSS at the bottom of the file.

**Step 5: Verify mentors page**

Run: `cd frontend && npm run dev`
Navigate to `/mentors`.
Expected: Clean flat cards with shadow, 2px accent bars, heading font on names, no glass effects.

**Step 6: Commit**

```bash
git add frontend/app/mentors/page.tsx
git commit -m "redesign mentors page: flat cards, clean shadows, no glass"
```

---

### Task 9: Redesign MentorDetailPanel and CreateMentorPanel

**Files:**
- Modify: `frontend/app/home/components/MentorDetailPanel.tsx`
- Modify: `frontend/app/home/components/CreateMentorPanel.tsx`

**Step 1: Update MentorDetailPanel**

Apply the same design tokens across the panel:
- Replace backdrop blur: `bg-white/95` → `bg-background`, remove `backdrop-blur`
- Replace dark background: `dark:bg-[#111111]/95` → `dark:bg-[#131312]`
- Update panel shadow: use `shadow-xl` instead of custom glass shadows
- Replace all `text-stone-*` with semantic tokens where possible
- Use standard type scale values (12, 14, 16, 20px)
- Replace `rounded-2xl` → `rounded-xl` for consistency
- Update field labels to use consistent styling

**Step 2: Update CreateMentorPanel**

Same token replacements as MentorDetailPanel. The structure stays the same, just the visual treatment changes.

**Step 3: Verify both panels**

Run: `cd frontend && npm run dev`
Open a mentor → customize. Create a new mentor.
Expected: Clean panels with solid backgrounds, consistent typography, no blur effects.

**Step 4: Commit**

```bash
git add frontend/app/home/components/MentorDetailPanel.tsx frontend/app/home/components/CreateMentorPanel.tsx
git commit -m "redesign mentor panels: solid backgrounds, consistent tokens"
```

---

### Task 10: Redesign Landing Page

**Files:**
- Modify: `frontend/app/page.tsx`

**Step 1: Update colors and typography**

- Replace `bg-[#faf9f6]` → `bg-background`
- Replace `dark:bg-[#0c0c0b]` → (handled by bg-background)
- Remove amber/orange/rose color references:
  - `bg-amber-100/50` → `bg-stone-200/20`
  - `bg-orange-50/30` → `bg-stone-100/15`
  - `border-amber-200/60` → `border-muted/20`
  - `bg-amber-50/50` → `bg-surface/50`
  - `text-amber-800` → `text-foreground`
  - `bg-amber-500` → `bg-muted`
  - `bg-amber-600/70` → `bg-muted/70` (cursor in typing animation)
- Update heading to use `font-heading` (now Fraunces instead of Libre Baskerville)
- Remove the grain texture div

**Step 2: Update the features grid**

Replace glass/border styling with clean shadow approach:
```tsx
<div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl bg-black/[0.04] sm:grid-cols-3 dark:bg-white/[0.04]">
  {features.map((feature) => (
    <div key={feature.title} className="bg-surface px-5 py-5">
      ...
    </div>
  ))}
</div>
```

**Step 3: Verify landing page**

Run: `cd frontend && npm run dev`
Navigate to `/`.
Expected: No amber/orange/yellow. Clean neutral palette. Fraunces headings.

**Step 4: Commit**

```bash
git add frontend/app/page.tsx
git commit -m "redesign landing page: remove warm colors, apply new palette"
```

---

### Task 11: Redesign Login Page

**Files:**
- Modify: `frontend/app/login/page.tsx`

**Step 1: Update colors and spacing**

- Replace `bg-[#faf9f6]` → `bg-background`
- Replace `dark:bg-[#0c0c0b]` → (handled by bg-background)
- Remove rose blobs: `bg-rose-200/30` → `bg-stone-200/20`
- Update card: `bg-white/80` → `bg-surface`, remove backdrop-blur
- Update heading to 32px (use `text-3xl` which is already correct)
- Update input styling:
  - `rounded-xl` → `rounded-lg` (8px for inputs)
  - Use `ring-1 ring-black/[0.06]` instead of `border border-stone-300`
  - Remove `shadow-sm` from inputs

**Step 2: Verify login page**

Run: `cd frontend && npm run dev`
Navigate to `/login`.
Expected: Clean login with no rose/pink blobs, consistent with new palette.

**Step 3: Commit**

```bash
git add frontend/app/login/page.tsx
git commit -m "redesign login page: new palette, clean inputs"
```

---

### Task 12: Update ThemeToggle Component

**Files:**
- Modify: `frontend/app/components/ThemeToggle.tsx`

**Step 1: Update button styling**

Ensure the toggle button uses consistent sizing and colors:
- Button: `h-10 w-10 rounded-lg text-muted hover:text-foreground`
- Icon: `h-5 w-5`

**Step 2: Commit**

```bash
git add frontend/app/components/ThemeToggle.tsx
git commit -m "update ThemeToggle with consistent sizing"
```

---

### Task 13: Clean Up Unused Components

**Files:**
- Check: `frontend/app/home/components/MentorsPanel.tsx`
- Check: `frontend/app/home/components/MemoryPanel.tsx`
- Check: `frontend/app/home/components/ChatPanel.tsx`
- Check: `frontend/app/home/components/MicVisualizer.tsx`

**Step 1: Check if these components are imported anywhere**

Run: `grep -r "MentorsPanel\|MemoryPanel\|ChatPanel\|MicVisualizer" frontend/app/ --include="*.tsx" --include="*.ts" -l`

**Step 2: Delete unused component files**

If any of these are not imported by any other file (besides their own definition), delete them.

**Step 3: Verify build succeeds**

Run: `cd frontend && npm run build`
Expected: Build succeeds with no import errors.

**Step 4: Commit**

```bash
git add -A frontend/app/home/components/
git commit -m "remove unused components"
```

---

### Task 14: Final Verification and Polish

**Files:**
- All modified files

**Step 1: Run the full build**

Run: `cd frontend && npm run build`
Expected: Build succeeds with no TypeScript errors.

**Step 2: Visual verification checklist**

Start dev server: `cd frontend && npm run dev`

Check each page:
- [ ] `/` - Landing page: Fraunces headings, no amber/yellow, clean cards
- [ ] `/login` - Login: no rose blobs, consistent inputs, Fraunces heading
- [ ] `/home` - Home: editorial messages, unified input zone, voice line, proper spacing
- [ ] `/home` (side panel) - Conversations list, "Memories" link at bottom
- [ ] `/mentors` - Flat cards, 2px accent bars, Fraunces names
- [ ] `/memory` - Memory entries organized by category/date
- [ ] Dark mode works on all pages
- [ ] Voice input works (mic toggle, waveform, transcript preview)
- [ ] Mentor switching works (accent color changes)

**Step 3: Fix any remaining freeform pixel values**

Search for non-standard sizes:
Run: `grep -rn "text-\[1[0-9]px\]\|text-\[2[0-9]px\]\|text-\[3[0-9]px\]" frontend/app/ --include="*.tsx"`

Replace any `text-[11px]`, `text-[13px]`, `text-[15px]` etc. with the nearest standard size:
- `[11px]` → `text-xs` (12px)
- `[13px]` → `text-xs` (12px) or `text-sm` (14px)
- `[15px]` → `text-base` (16px)

**Step 4: Final commit**

```bash
git add -A frontend/
git commit -m "final polish: fix remaining spacing and type scale issues"
```

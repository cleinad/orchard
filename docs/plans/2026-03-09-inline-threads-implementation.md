# Inline Threads & Learning Mode Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a learning mode that lets users highlight text in assistant responses to get inline definitions via a popover, with follow-ups graduating to a side panel thread. Conversations become trees.

**Architecture:** Messages form a tree via `thread_id` and `parent_message_id` columns. A separate `threads` table stores metadata (highlighted text, source message). The same `/api/chat` endpoint handles thread messages with a `concise` flag for popover responses. A `LearningModeProvider` context controls the feature toggle.

**Tech Stack:** Next.js 16, React 19, Supabase (Postgres), Tailwind 4, Vercel AI SDK, react-markdown 9

---

### Task 1: Database Migration — threads table and messages columns

**Files:**
- Create: Supabase migration (via `apply_migration`)

**Step 1: Apply migration**

Run this migration via `mcp__supabase__apply_migration`:

```sql
-- Create threads table
create table if not exists public.threads (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  source_message_id uuid not null references public.messages(id) on delete cascade,
  highlighted_text text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Add thread columns to messages
alter table public.messages
  add column if not exists thread_id uuid references public.threads(id) on delete cascade,
  add column if not exists parent_message_id uuid references public.messages(id) on delete set null;

-- Index for fetching threads by conversation
create index if not exists idx_threads_conversation_id on public.threads(conversation_id);

-- Index for fetching threads by source message
create index if not exists idx_threads_source_message_id on public.threads(source_message_id);

-- Index for fetching messages by thread
create index if not exists idx_messages_thread_id on public.messages(thread_id);

-- RLS policies for threads
alter table public.threads enable row level security;

create policy "Users can read own threads"
  on public.threads for select
  using (auth.uid() = user_id);

create policy "Users can insert own threads"
  on public.threads for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own threads"
  on public.threads for delete
  using (auth.uid() = user_id);
```

**Step 2: Verify migration**

Run via `mcp__supabase__execute_sql`:
```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'threads' ORDER BY ordinal_position;
```

Expected: id, conversation_id, source_message_id, highlighted_text, user_id, created_at columns present.

Also verify messages columns:
```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'messages' AND column_name IN ('thread_id', 'parent_message_id');
```

Expected: thread_id (uuid), parent_message_id (uuid) both present.

**Step 3: Commit**

```bash
git add -A && git commit -m "add threads table and thread columns to messages"
```

---

### Task 2: LearningModeProvider Context

**Files:**
- Create: `frontend/app/home/components/LearningModeContext.tsx`

**Step 1: Create the context provider**

```tsx
"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

interface LearningModeContextType {
  learningMode: boolean;
  toggleLearningMode: () => void;
}

const LearningModeContext = createContext<LearningModeContextType>({
  learningMode: false,
  toggleLearningMode: () => {},
});

export function useLearningMode() {
  return useContext(LearningModeContext);
}

export function LearningModeProvider({ children }: { children: ReactNode }) {
  const [learningMode, setLearningMode] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("learningMode");
    if (stored === "true") setLearningMode(true);
  }, []);

  const toggleLearningMode = () => {
    setLearningMode((prev) => {
      const next = !prev;
      localStorage.setItem("learningMode", String(next));
      return next;
    });
  };

  return (
    <LearningModeContext.Provider value={{ learningMode, toggleLearningMode }}>
      {children}
    </LearningModeContext.Provider>
  );
}
```

**Step 2: Commit**

```bash
git add frontend/app/home/components/LearningModeContext.tsx
git commit -m "add LearningModeProvider context"
```

---

### Task 3: HomeHeader — Learning Mode Toggle Button

**Files:**
- Modify: `frontend/app/home/components/HomeHeader.tsx`

**Step 1: Add the toggle button**

Import `useLearningMode` from `./LearningModeContext`.

Add a new button in the right-side `div` (between the browse mentors button and ThemeToggle). Use a book/graduation-cap icon. When active, the icon should be `text-foreground`; when inactive, `text-muted` like the other buttons.

```tsx
"use client";

import ThemeToggle from "@/app/components/ThemeToggle";
import { useLearningMode } from "./LearningModeContext";

type HomeHeaderProps = {
  activeName: string;
  onOpenSidePanel: () => void;
  onBrowseMentors: () => void;
};

export default function HomeHeader({
  activeName,
  onOpenSidePanel,
  onBrowseMentors,
}: HomeHeaderProps) {
  const { learningMode, toggleLearningMode } = useLearningMode();

  return (
    <header className="flex h-16 items-center justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onOpenSidePanel}
          aria-label="Open conversations"
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-muted transition hover:text-foreground"
        >
          <svg
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5"
            />
          </svg>
        </button>

        <div className="min-w-0">
          <div className="mt-1 flex items-center gap-2">
            <span className="truncate font-heading text-xl text-foreground">{activeName}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBrowseMentors}
          aria-label="Browse mentors"
          title="Browse mentors"
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-muted transition hover:text-foreground"
        >
          <svg
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z"
            />
          </svg>
        </button>

        <button
          type="button"
          onClick={toggleLearningMode}
          aria-label="Toggle learning mode"
          title="Learning mode"
          className={`inline-flex h-10 w-10 items-center justify-center rounded-lg transition hover:text-foreground ${
            learningMode ? "text-foreground" : "text-muted"
          }`}
        >
          <svg
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
            />
          </svg>
        </button>

        <ThemeToggle />
      </div>
    </header>
  );
}
```

**Step 2: Commit**

```bash
git add frontend/app/home/components/HomeHeader.tsx
git commit -m "add learning mode toggle to header"
```

---

### Task 4: API Route — Thread Support

**Files:**
- Modify: `frontend/app/api/chat/route.ts`

**Step 1: Extend the request interface and handler**

Add new optional fields to `ChatRequest`:

```ts
interface ChatRequest {
  message: string;
  conversationId?: string;
  mentorId?: string;
  threadId?: string;
  sourceMessageId?: string;
  highlightedText?: string;
  concise?: boolean;
}
```

After the existing `const body: ChatRequest = await request.json();` line, destructure the new fields:

```ts
const { message, conversationId, mentorId, threadId, sourceMessageId, highlightedText, concise } = body;
```

After saving the user message (around line 233), add thread handling logic. If `sourceMessageId` and `highlightedText` are provided but no `threadId`, create a new thread. If `threadId` is provided, use it:

```ts
let activeThreadId = threadId || null;

// Create a new thread if this is the first message about a highlight
if (!activeThreadId && sourceMessageId && highlightedText) {
  const { data: threadRow, error: threadError } = await supabase
    .from('threads')
    .insert({
      conversation_id: activeConversationId,
      source_message_id: sourceMessageId,
      highlighted_text: highlightedText,
      user_id: user.id,
    })
    .select('id')
    .single();

  if (threadError || !threadRow) {
    console.error('Error creating thread:', threadError);
    return NextResponse.json({ error: 'Failed to create thread' }, { status: 500 });
  }

  activeThreadId = threadRow.id;
}
```

Modify the user message insert to include thread fields when present:

```ts
const { data: userMessageRow, error: userMsgError } = await supabase
  .from('messages')
  .insert({
    conversation_id: activeConversationId,
    user_id: user.id,
    role: 'user',
    content: message,
    ...(activeThreadId ? { thread_id: activeThreadId, parent_message_id: sourceMessageId || null } : {}),
  })
  .select('id')
  .single();
```

For the message history query, when in a thread, fetch both main conversation context AND thread-specific messages:

```ts
let messages;
if (activeThreadId) {
  // Fetch main conversation messages for context (exclude thread messages)
  const { data: mainHistory } = await supabase
    .from('messages')
    .select('role, content')
    .eq('conversation_id', activeConversationId)
    .is('thread_id', null)
    .order('created_at', { ascending: true })
    .limit(50);

  // Fetch this thread's messages
  const { data: threadHistory } = await supabase
    .from('messages')
    .select('role, content')
    .eq('thread_id', activeThreadId)
    .order('created_at', { ascending: true })
    .limit(30);

  messages = mainHistory || [];
  const threadMessages = threadHistory || [];

  // We'll handle combining these in the system prompt
  // For the LLM messages array, send main context + thread messages
  messages = [...messages, ...threadMessages];
} else {
  const { data: history } = await supabase
    .from('messages')
    .select('role, content')
    .eq('conversation_id', activeConversationId)
    .is('thread_id', null)
    .order('created_at', { ascending: true })
    .limit(50);

  messages = history || [{ role: 'user', content: message }];
}
```

For the system prompt, add thread-specific instructions. Look up the highlighted text from the thread if `activeThreadId` is set:

```ts
let threadHighlightedText = highlightedText || null;
if (activeThreadId && !threadHighlightedText) {
  const { data: threadData } = await supabase
    .from('threads')
    .select('highlighted_text')
    .eq('id', activeThreadId)
    .single();
  threadHighlightedText = threadData?.highlighted_text || null;
}

// Build system prompt (existing code)
let systemPrompt = isMentorConversation
  ? buildMentorSystemPrompt(buildMentorPrompt(mentor!, profile?.full_name || ''), memoryContext)
  : buildSystemPrompt(memoryContext);

// Append thread instructions
if (activeThreadId && threadHighlightedText) {
  if (concise) {
    systemPrompt += `\n\nThe user has highlighted the phrase "${threadHighlightedText}" from the conversation and is asking about it. Respond in 2-3 sentences. Be direct and definitional.`;
  } else {
    systemPrompt += `\n\nThe user is exploring a concept from the main conversation. The highlighted phrase was: "${threadHighlightedText}". Respond conversationally.`;
  }
}
```

Modify the assistant message insert to include thread fields:

```ts
const { error: assistantMsgError } = await supabase.from('messages').insert({
  conversation_id: activeConversationId,
  user_id: user.id,
  role: 'assistant',
  content: assistantResponse,
  ...(activeThreadId ? { thread_id: activeThreadId, parent_message_id: sourceMessageId || null } : {}),
});
```

Update the response to include `threadId`:

```ts
return NextResponse.json({
  message: assistantResponse,
  conversationId: activeConversationId,
  mentorId: mentor?.id ?? null,
  threadId: activeThreadId,
});
```

**Step 2: Verify the build compiles**

```bash
cd frontend && npx next build 2>&1 | tail -20
```

**Step 3: Commit**

```bash
git add frontend/app/api/chat/route.ts
git commit -m "extend chat API with thread support"
```

---

### Task 5: TextSelectionPopover Component

**Files:**
- Create: `frontend/app/home/components/TextSelectionPopover.tsx`

**Step 1: Create the popover component**

This component:
- Receives `popoverState` (position, selectedText, sourceMessageId) and callbacks
- Renders a floating div positioned near the selection
- Has a "Define" button and a text input
- On action, calls the chat API with `concise: true` and displays the response
- On follow-up, calls `onGraduateToThread` to open the side panel

```tsx
"use client";

import { useState, useRef, useEffect } from "react";

export interface PopoverState {
  visible: boolean;
  x: number;
  y: number;
  selectedText: string;
  sourceMessageId: string;
}

interface TextSelectionPopoverProps {
  popoverState: PopoverState | null;
  conversationId: string | null;
  onDismiss: () => void;
  onThreadCreated: (threadId: string, sourceMessageId: string, highlightedText: string) => void;
  onGraduateToThread: (threadId: string) => void;
}

export default function TextSelectionPopover({
  popoverState,
  conversationId,
  onDismiss,
  onThreadCreated,
  onGraduateToThread,
}: TextSelectionPopoverProps) {
  const [customQuestion, setCustomQuestion] = useState("");
  const [response, setResponse] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [followUpInput, setFollowUpInput] = useState("");
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset state when popover opens/closes
  useEffect(() => {
    if (!popoverState?.visible) {
      setCustomQuestion("");
      setResponse(null);
      setThreadId(null);
      setIsLoading(false);
      setFollowUpInput("");
    }
  }, [popoverState?.visible]);

  // Click outside to dismiss
  useEffect(() => {
    if (!popoverState?.visible) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onDismiss();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };

    // Delay adding listener to avoid immediate dismissal from the mouseup that opened it
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEscape);
    }, 100);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [popoverState?.visible, onDismiss]);

  if (!popoverState?.visible) return null;

  const sendQuestion = async (question: string) => {
    if (!conversationId || isLoading) return;

    setIsLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: question,
          conversationId,
          sourceMessageId: popoverState.sourceMessageId,
          highlightedText: popoverState.selectedText,
          concise: true,
          ...(threadId ? { threadId } : {}),
        }),
      });

      const data = await res.json();
      if (res.ok && data.message) {
        setResponse(data.message);
        if (data.threadId && !threadId) {
          setThreadId(data.threadId);
          onThreadCreated(data.threadId, popoverState.sourceMessageId, popoverState.selectedText);
        }
      }
    } catch {
      setResponse("Something went wrong.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDefine = () => {
    sendQuestion(`What is "${popoverState.selectedText}"?`);
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (customQuestion.trim()) {
      sendQuestion(customQuestion.trim());
    }
  };

  const handleFollowUp = (e: React.FormEvent) => {
    e.preventDefault();
    if (followUpInput.trim() && threadId) {
      onDismiss();
      onGraduateToThread(threadId);
    }
  };

  // Position the popover (above the selection, centered)
  const style: React.CSSProperties = {
    position: "fixed",
    left: popoverState.x,
    top: popoverState.y,
    transform: "translate(-50%, -100%)",
    zIndex: 60,
  };

  return (
    <div ref={popoverRef} style={style} className="w-80 rounded-xl bg-surface p-4 shadow-lg ring-1 ring-black/[0.08] dark:ring-white/[0.08]">
      {/* Selected text preview */}
      <p className="mb-3 text-xs text-muted/60 line-clamp-2">
        &ldquo;{popoverState.selectedText}&rdquo;
      </p>

      {!response && !isLoading && (
        <>
          {/* Define button */}
          <button
            type="button"
            onClick={handleDefine}
            className="mb-2 w-full rounded-lg bg-foreground/5 px-3 py-2 text-left text-sm font-medium text-foreground transition hover:bg-foreground/10"
          >
            Define
          </button>

          {/* Custom question input */}
          <form onSubmit={handleCustomSubmit}>
            <input
              ref={inputRef}
              type="text"
              value={customQuestion}
              onChange={(e) => setCustomQuestion(e.target.value)}
              placeholder="Ask something about this..."
              className="w-full rounded-lg bg-foreground/5 px-3 py-2 text-sm text-foreground placeholder-muted/50 outline-none focus:ring-1 focus:ring-foreground/10"
            />
          </form>
        </>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center gap-1.5 py-2">
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted/40" style={{ animationDelay: "0ms" }} />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted/40" style={{ animationDelay: "150ms" }} />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted/40" style={{ animationDelay: "300ms" }} />
        </div>
      )}

      {/* Response */}
      {response && !isLoading && (
        <>
          <p className="text-sm leading-relaxed text-foreground">{response}</p>

          {/* Follow-up input to graduate to side panel */}
          <form onSubmit={handleFollowUp} className="mt-3">
            <input
              type="text"
              value={followUpInput}
              onChange={(e) => setFollowUpInput(e.target.value)}
              placeholder="Ask a follow-up..."
              className="w-full rounded-lg bg-foreground/5 px-3 py-2 text-sm text-foreground placeholder-muted/50 outline-none focus:ring-1 focus:ring-foreground/10"
            />
          </form>
        </>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add frontend/app/home/components/TextSelectionPopover.tsx
git commit -m "add TextSelectionPopover component"
```

---

### Task 6: ThreadPanel Component

**Files:**
- Create: `frontend/app/home/components/ThreadPanel.tsx`

**Step 1: Create the thread panel**

This follows the same structural pattern as `MentorDetailPanel` — right-side slide-in at ~460px wide. It loads thread messages, displays them, and has an input at the bottom.

```tsx
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import ReactMarkdown from "react-markdown";

interface ThreadMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface ThreadInfo {
  id: string;
  highlightedText: string;
  sourceMessageId: string;
}

interface ThreadPanelProps {
  isOpen: boolean;
  thread: ThreadInfo | null;
  conversationId: string | null;
  onClose: () => void;
}

export default function ThreadPanel({
  isOpen,
  thread,
  conversationId,
  onClose,
}: ThreadPanelProps) {
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load thread messages when thread changes
  useEffect(() => {
    if (!thread || !isOpen) {
      setMessages([]);
      setInput("");
      return;
    }

    const loadMessages = async () => {
      try {
        const res = await fetch(`/api/threads/${thread.id}/messages`);
        if (res.ok) {
          const data = await res.json();
          setMessages(
            data.messages.map((m: { id: string; role: string; content: string; created_at: string }) => ({
              id: m.id,
              role: m.role as "user" | "assistant",
              content: m.content,
              timestamp: new Date(m.created_at),
            }))
          );
        }
      } catch {
        // Silently fail — thread may be new with no messages yet
      }
    };

    loadMessages();
  }, [thread, isOpen]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  const sendMessage = useCallback(async () => {
    if (!input.trim() || !thread || !conversationId || isLoading) return;

    const content = input.trim();
    const userMessage: ThreadMessage = {
      id: Date.now().toString(),
      role: "user",
      content,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: content,
          conversationId,
          threadId: thread.id,
        }),
      });

      const data = await res.json();
      if (res.ok && data.message) {
        const assistantMessage: ThreadMessage = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: data.message,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
      }
    } catch {
      const errorMessage: ThreadMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "Something went wrong.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  }, [input, thread, conversationId, isLoading]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex justify-end transition-all duration-300 ${
        isOpen ? "pointer-events-auto" : "pointer-events-none"
      }`}
    >
      {/* Backdrop (mobile) */}
      <div
        className={`absolute inset-0 bg-black/20 transition-opacity duration-300 lg:hidden ${
          isOpen ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
      />

      {/* Panel */}
      <aside
        className={`relative flex h-full w-full max-w-[460px] flex-col bg-background shadow-xl transition-transform duration-300 ease-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-black/[0.06] px-6 py-4 dark:border-white/[0.06]">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium tracking-wider text-muted/60">THREAD</p>
            {thread && (
              <p className="mt-1 text-sm text-foreground line-clamp-2">
                &ldquo;{thread.highlightedText}&rdquo;
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ml-4 inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-muted transition hover:text-foreground"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Messages */}
        <div
          className="flex-1 overflow-y-auto px-6 py-4"
          style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(0,0,0,0.08) transparent" }}
        >
          {messages.map((message) => (
            <div key={message.id} className="py-3">
              <span className="text-xs font-medium tracking-wider text-muted">
                {message.role === "user" ? "You" : "Thread"}
              </span>
              <div className="mt-1 text-sm leading-relaxed text-foreground [&_p]:mb-3 [&_p:last-child]:mb-0 [&_ul]:mb-3 [&_ul]:ml-5 [&_ul]:list-disc [&_ol]:mb-3 [&_ol]:ml-5 [&_ol]:list-decimal [&_li]:mb-1 [&_code]:rounded [&_code]:bg-stone-100 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-xs [&_code]:text-stone-700 dark:[&_code]:bg-stone-800 dark:[&_code]:text-stone-300">
                <ReactMarkdown>{message.content}</ReactMarkdown>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="py-3">
              <span className="text-xs font-medium tracking-wider text-muted">Thread</span>
              <div className="mt-1 flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted/40" style={{ animationDelay: "0ms" }} />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted/40" style={{ animationDelay: "150ms" }} />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted/40" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t border-black/[0.06] px-6 py-4 dark:border-white/[0.06]">
          <div className="flex items-center gap-2 rounded-xl bg-surface px-4 py-2 shadow-sm ring-1 ring-black/[0.04] dark:ring-white/[0.06]">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a follow-up..."
              disabled={isLoading}
              className="w-full bg-transparent py-1 text-sm text-foreground placeholder-muted/50 outline-none disabled:opacity-50"
            />
            <button
              type="button"
              onClick={sendMessage}
              disabled={!input.trim() || isLoading}
              className="flex-shrink-0 rounded-lg bg-foreground p-1.5 text-background transition-opacity hover:opacity-80 disabled:opacity-20"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
              </svg>
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add frontend/app/home/components/ThreadPanel.tsx
git commit -m "add ThreadPanel side panel component"
```

---

### Task 7: Thread Messages API Route

**Files:**
- Create: `frontend/app/api/threads/[threadId]/messages/route.ts`

**Step 1: Create the API route**

```ts
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  try {
    const { threadId } = await params;
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify thread belongs to user
    const { data: thread, error: threadError } = await supabase
      .from("threads")
      .select("id")
      .eq("id", threadId)
      .eq("user_id", user.id)
      .single();

    if (threadError || !thread) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    // Fetch thread messages
    const { data: messages, error: messagesError } = await supabase
      .from("messages")
      .select("id, role, content, created_at")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });

    if (messagesError) {
      return NextResponse.json({ error: messagesError.message }, { status: 500 });
    }

    return NextResponse.json({ messages: messages || [] });
  } catch (error) {
    console.error("Thread messages API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
```

**Step 2: Commit**

```bash
git add frontend/app/api/threads/
git commit -m "add thread messages API route"
```

---

### Task 8: MarkdownWithThreads and ThreadIndicator

**Files:**
- Create: `frontend/app/home/components/MarkdownWithThreads.tsx`

**Step 1: Create the component**

This wraps ReactMarkdown and injects `ThreadIndicator` spans for highlighted phrases that have threads. Uses a custom text component renderer.

```tsx
"use client";

import ReactMarkdown from "react-markdown";
import type { ReactNode, ComponentPropsWithoutRef } from "react";

export interface ThreadMeta {
  threadId: string;
  highlightedText: string;
  sourceMessageId: string;
}

interface MarkdownWithThreadsProps {
  content: string;
  threads: ThreadMeta[];
  onThreadClick: (thread: ThreadMeta) => void;
}

function ThreadIndicator({
  children,
  thread,
  onClick,
}: {
  children: ReactNode;
  thread: ThreadMeta;
  onClick: (thread: ThreadMeta) => void;
}) {
  return (
    <span
      role="button"
      tabIndex={0}
      onClick={() => onClick(thread)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick(thread);
      }}
      className="cursor-pointer border-b border-dashed border-foreground/30 text-foreground transition-colors hover:border-foreground/60 hover:text-foreground/80"
      title="View thread"
    >
      {children}
    </span>
  );
}

function splitTextWithThreads(
  text: string,
  threads: ThreadMeta[],
  onThreadClick: (thread: ThreadMeta) => void
): ReactNode[] {
  if (threads.length === 0) return [text];

  const parts: ReactNode[] = [];
  let remaining = text;
  let keyIndex = 0;

  // Try to find and wrap each thread's highlighted text
  for (const thread of threads) {
    const idx = remaining.indexOf(thread.highlightedText);
    if (idx === -1) continue;

    // Text before the match
    if (idx > 0) {
      parts.push(remaining.slice(0, idx));
    }

    // The matched/highlighted portion
    parts.push(
      <ThreadIndicator key={`thread-${keyIndex++}`} thread={thread} onClick={onThreadClick}>
        {thread.highlightedText}
      </ThreadIndicator>
    );

    remaining = remaining.slice(idx + thread.highlightedText.length);
  }

  // Remaining text after all matches
  if (remaining) {
    parts.push(remaining);
  }

  return parts.length > 0 ? parts : [text];
}

export default function MarkdownWithThreads({
  content,
  threads,
  onThreadClick,
}: MarkdownWithThreadsProps) {
  if (threads.length === 0) {
    return <ReactMarkdown>{content}</ReactMarkdown>;
  }

  return (
    <ReactMarkdown
      components={{
        p: ({ children, ...props }: ComponentPropsWithoutRef<"p">) => {
          const processed = processChildren(children, threads, onThreadClick);
          return <p {...props}>{processed}</p>;
        },
        li: ({ children, ...props }: ComponentPropsWithoutRef<"li">) => {
          const processed = processChildren(children, threads, onThreadClick);
          return <li {...props}>{processed}</li>;
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

function processChildren(
  children: ReactNode,
  threads: ThreadMeta[],
  onThreadClick: (thread: ThreadMeta) => void
): ReactNode {
  if (typeof children === "string") {
    const parts = splitTextWithThreads(children, threads, onThreadClick);
    return parts.length === 1 && typeof parts[0] === "string" ? parts[0] : <>{parts}</>;
  }

  if (Array.isArray(children)) {
    return children.map((child, i) => {
      if (typeof child === "string") {
        const parts = splitTextWithThreads(child, threads, onThreadClick);
        return parts.length === 1 && typeof parts[0] === "string" ? (
          child
        ) : (
          <span key={i}>{parts}</span>
        );
      }
      return child;
    });
  }

  return children;
}
```

**Step 2: Commit**

```bash
git add frontend/app/home/components/MarkdownWithThreads.tsx
git commit -m "add MarkdownWithThreads with ThreadIndicator"
```

---

### Task 9: Integrate Everything into page.tsx

**Files:**
- Modify: `frontend/app/home/page.tsx`

**Step 1: Add imports**

Add these imports at the top of page.tsx:

```tsx
import { LearningModeProvider, useLearningMode } from '@/app/home/components/LearningModeContext';
import TextSelectionPopover, { type PopoverState } from '@/app/home/components/TextSelectionPopover';
import ThreadPanel from '@/app/home/components/ThreadPanel';
import MarkdownWithThreads, { type ThreadMeta } from '@/app/home/components/MarkdownWithThreads';
```

Remove the existing `import ReactMarkdown from 'react-markdown';` since MarkdownWithThreads handles it now.

**Step 2: Wrap with LearningModeProvider**

Change the `HomePage` component to wrap `HomePageInner` with `LearningModeProvider`:

```tsx
export default function HomePage() {
  return (
    <Suspense>
      <LearningModeProvider>
        <HomePageInner />
      </LearningModeProvider>
    </Suspense>
  );
}
```

**Step 3: Add thread state to HomePageInner**

Add these state variables after the existing state declarations (around line 61):

```tsx
const { learningMode } = useLearningMode();
const [popoverState, setPopoverState] = useState<PopoverState | null>(null);
const [threadsMap, setThreadsMap] = useState<Map<string, ThreadMeta[]>>(new Map());
const [activeThread, setActiveThread] = useState<{ id: string; highlightedText: string; sourceMessageId: string } | null>(null);
const [threadPanelOpen, setThreadPanelOpen] = useState(false);
```

**Step 4: Add text selection handler**

Add a `handlePointerUp` function after the existing handlers:

```tsx
const handlePointerUp = useCallback(() => {
  if (!learningMode) return;

  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.toString().trim()) return;

  const selectedText = selection.toString().trim();
  if (selectedText.length < 2 || selectedText.length > 500) return;

  // Find which assistant message the selection is in
  const range = selection.getRangeAt(0);
  const messageEl = (range.startContainer as HTMLElement).closest?.('[data-message-id]')
    || (range.startContainer.parentElement as HTMLElement)?.closest?.('[data-message-id]');

  if (!messageEl) return;

  const messageId = messageEl.getAttribute('data-message-id');
  const messageRole = messageEl.getAttribute('data-message-role');

  if (!messageId || messageRole !== 'assistant') return;

  const rect = range.getBoundingClientRect();
  setPopoverState({
    visible: true,
    x: rect.left + rect.width / 2,
    y: rect.top - 8,
    selectedText,
    sourceMessageId: messageId,
  });
}, [learningMode]);
```

**Step 5: Load threads when loading conversation**

Modify `loadConversationMessages` to also load threads. After the existing message loading, add:

```tsx
// Load threads for this conversation
const { data: threadRows } = await supabase
  .from('threads')
  .select('id, source_message_id, highlighted_text')
  .eq('conversation_id', nextConversationId);

const nextThreadsMap = new Map<string, ThreadMeta[]>();
for (const t of threadRows || []) {
  const key = t.source_message_id;
  const existing = nextThreadsMap.get(key) || [];
  existing.push({
    threadId: t.id,
    highlightedText: t.highlighted_text,
    sourceMessageId: t.source_message_id,
  });
  nextThreadsMap.set(key, existing);
}
setThreadsMap(nextThreadsMap);
```

**Step 6: Add thread callback handlers**

```tsx
const handleThreadCreated = useCallback((threadId: string, sourceMessageId: string, highlightedText: string) => {
  setThreadsMap((prev) => {
    const next = new Map(prev);
    const existing = next.get(sourceMessageId) || [];
    existing.push({ threadId, highlightedText, sourceMessageId });
    next.set(sourceMessageId, existing);
    return next;
  });
}, []);

const handleGraduateToThread = useCallback((threadId: string) => {
  // Find thread info from threadsMap
  for (const threads of threadsMap.values()) {
    const found = threads.find((t) => t.threadId === threadId);
    if (found) {
      setActiveThread({ id: found.threadId, highlightedText: found.highlightedText, sourceMessageId: found.sourceMessageId });
      setThreadPanelOpen(true);
      setPopoverState(null);
      return;
    }
  }
}, [threadsMap]);

const handleThreadClick = useCallback((thread: ThreadMeta) => {
  setActiveThread({ id: thread.threadId, highlightedText: thread.highlightedText, sourceMessageId: thread.sourceMessageId });
  setThreadPanelOpen(true);
}, []);
```

**Step 7: Update message rendering**

Replace the message content rendering. Change the `messages.map` block. Add `data-message-id` and `data-message-role` attributes to the message div, add `onPointerUp` handler, and replace `<ReactMarkdown>` with `<MarkdownWithThreads>`:

Find this in the message map (around line 544):
```tsx
<div key={message.id} className="py-4">
```

Replace the whole message block with:
```tsx
<div key={message.id} className="py-4" data-message-id={message.id} data-message-role={message.role} onPointerUp={handlePointerUp}>
  <div className="flex items-baseline justify-between">
    <span className="text-xs font-medium tracking-wider text-muted">
      {message.role === 'user' ? 'You' : activeName}
    </span>
    <span className="text-xs text-muted/60">
      {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
    </span>
  </div>
  <div className="mt-2 text-base leading-relaxed text-foreground [&_p]:mb-4 [&_p:last-child]:mb-0 [&_ul]:mb-4 [&_ul]:ml-5 [&_ul]:list-disc [&_ol]:mb-4 [&_ol]:ml-5 [&_ol]:list-decimal [&_li]:mb-1 [&_code]:rounded [&_code]:bg-stone-100 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-sm [&_code]:text-stone-700 dark:[&_code]:bg-stone-800 dark:[&_code]:text-stone-300 [&_pre]:my-4 [&_pre]:rounded-lg [&_pre]:bg-stone-100 [&_pre]:p-4 dark:[&_pre]:bg-stone-800">
    <MarkdownWithThreads
      content={message.content}
      threads={threadsMap.get(message.id) || []}
      onThreadClick={handleThreadClick}
    />
  </div>
</div>
```

**Step 8: Add popover and thread panel to render tree**

After the `CreateMentorPanel` component (around line 741), add:

```tsx
<TextSelectionPopover
  popoverState={popoverState}
  conversationId={conversationId}
  onDismiss={() => setPopoverState(null)}
  onThreadCreated={handleThreadCreated}
  onGraduateToThread={handleGraduateToThread}
/>
<ThreadPanel
  isOpen={threadPanelOpen}
  thread={activeThread}
  conversationId={conversationId}
  onClose={() => {
    setThreadPanelOpen(false);
    setActiveThread(null);
  }}
/>
```

**Step 9: Filter main conversation messages**

In `loadConversationMessages`, update the query to only load main thread messages (exclude thread messages). Add `.is('thread_id', null)` to the query:

```tsx
const { data, error } = await supabase
  .from('messages')
  .select('id, role, content, created_at')
  .eq('conversation_id', nextConversationId)
  .is('thread_id', null)
  .order('created_at', { ascending: true })
  .limit(200);
```

**Step 10: Verify build**

```bash
cd frontend && npx next build 2>&1 | tail -30
```

**Step 11: Commit**

```bash
git add frontend/app/home/page.tsx
git commit -m "integrate learning mode, popover, and thread panel into home page"
```

---

### Task 10: Build Verification & Smoke Test

**Step 1: Run full build**

```bash
cd /home/daniel-chen/Documents/code/projects/learning-mode/frontend && npx next build
```

Expected: Build succeeds with no errors.

**Step 2: Fix any TypeScript or build errors**

If there are type errors or missing imports, fix them and re-run the build.

**Step 3: Final commit if fixes were needed**

```bash
git add -A && git commit -m "fix build errors in learning mode integration"
```

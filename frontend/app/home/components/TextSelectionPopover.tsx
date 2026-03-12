"use client";

import { useState, useRef, useEffect } from "react";
import MarkdownWithThreads from "@/app/home/components/MarkdownWithThreads";
import { markdownContentClassName } from "@/lib/markdown";

export interface PopoverState {
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
  onGraduateToThread: (threadId: string, sourceMessageId: string, highlightedText: string, pendingMessage?: string) => void;
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

  // Reset state when popover closes or selection changes
  const prevSelectionKey = useRef<string | null>(null);
  useEffect(() => {
    const key = popoverState
      ? `${popoverState.sourceMessageId}:${popoverState.selectedText}`
      : null;

    if (!popoverState || key !== prevSelectionKey.current) {
      setCustomQuestion("");
      setResponse(null);
      setThreadId(null);
      setIsLoading(false);
      setFollowUpInput("");
    }
    prevSelectionKey.current = key;
  }, [popoverState]);

  // Click outside to dismiss
  useEffect(() => {
    if (!popoverState) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onDismiss();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };

    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEscape);
    }, 100);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [popoverState, onDismiss]);

  if (!popoverState) return null;

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
      } else {
        setResponse(data.error || "Something went wrong.");
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
      const pendingText = followUpInput.trim();
      onDismiss();
      onGraduateToThread(threadId, popoverState.sourceMessageId, popoverState.selectedText, pendingText);
    }
  };

  const style: React.CSSProperties = {
    position: "fixed",
    left: popoverState.x,
    top: popoverState.y,
    transform: "translate(-50%, -100%)",
    zIndex: 60,
  };

  return (
    <div ref={popoverRef} style={style} className="w-80 rounded-xl bg-surface p-4 shadow-lg ring-1 ring-black/[0.08] dark:ring-white/[0.08]">
      <p className="mb-3 text-xs text-muted/60 line-clamp-2">
        &ldquo;{popoverState.selectedText}&rdquo;
      </p>

      {!response && !isLoading && (
        <>
          <button
            type="button"
            onClick={handleDefine}
            className="mb-2 w-full rounded-lg bg-foreground/5 px-3 py-2 text-left text-sm font-medium text-foreground transition hover:bg-foreground/10"
          >
            Define
          </button>

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

      {isLoading && (
        <div className="flex items-center gap-1.5 py-2">
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted/40" style={{ animationDelay: "0ms" }} />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted/40" style={{ animationDelay: "150ms" }} />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted/40" style={{ animationDelay: "300ms" }} />
        </div>
      )}

      {response && !isLoading && (
        <>
          <div className={`${markdownContentClassName} text-sm leading-relaxed text-foreground`}>
            <MarkdownWithThreads
              content={response}
              threads={[]}
              onThreadClick={() => {}}
            />
          </div>

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

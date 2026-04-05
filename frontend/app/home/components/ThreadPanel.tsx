"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { Message } from "@/app/home/types";
import MarkdownWithThreads from "@/app/home/components/MarkdownWithThreads";
import { markdownContentClassName } from "@/lib/markdown";
import {
  createTemporaryId,
  toChatHistory,
  type ChatMode,
  type TemporaryMemoryMode,
} from "@/lib/chat-session";

export interface ThreadMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface ThreadMessageRow {
  id: string;
  role: string;
  content: string;
  created_at: string;
}

interface ThreadInfo {
  id: string | null;
  highlightedText: string;
  sourceMessageId: string;
}

interface ThreadPanelProps {
  isOpen: boolean;
  thread: ThreadInfo | null;
  chatMode: ChatMode;
  conversationId: string | null;
  mentorId?: string | null;
  memoryMode: TemporaryMemoryMode;
  conversationMessages: Message[];
  initialMessages?: ThreadMessage[] | null;
  temporaryMessages?: ThreadMessage[] | null;
  temporaryChatEnabled: boolean;
  draftInput?: string | null;
  loadingQuestion?: string | null;
  pendingMessage?: string | null;
  onTemporaryMessagesChange?: (threadId: string, messages: ThreadMessage[]) => void;
  onPendingMessageConsumed?: () => void;
  onThreadCreated?: (threadId: string, sourceMessageId: string, highlightedText: string) => void;
  suspendCloseShortcut?: boolean;
  onClose: () => void;
}

function mapThreadMessages(rows: ThreadMessageRow[]): ThreadMessage[] {
  return rows.map((message) => ({
    id: message.id,
    role: message.role as "user" | "assistant",
    content: message.content,
    timestamp: new Date(message.created_at),
  }));
}

// Preserve optimistic follow-up messages until the server-backed history catches up.
// Only apply fuzzy content+time matching for optimistic messages (temporary numeric IDs).
function mergeThreadMessages(
  serverMessages: ThreadMessage[],
  localMessages: ThreadMessage[]
): ThreadMessage[] {
  const merged = [...serverMessages];
  const isOptimisticId = (id: string) => /^\d+$/.test(id);

  for (const localMessage of localMessages) {
    const alreadyExists = merged.some(
      (serverMessage) =>
        serverMessage.id === localMessage.id ||
        (isOptimisticId(localMessage.id) &&
          serverMessage.role === localMessage.role &&
          serverMessage.content === localMessage.content &&
          Math.abs(serverMessage.timestamp.getTime() - localMessage.timestamp.getTime()) < 5_000)
    );

    if (!alreadyExists) {
      merged.push(localMessage);
    }
  }

  return merged.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}

function toSnippet(text: string, maxLength = 88): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
}

export default function ThreadPanel({
  isOpen,
  thread,
  chatMode,
  conversationId,
  mentorId,
  memoryMode,
  conversationMessages,
  initialMessages,
  temporaryMessages,
  temporaryChatEnabled,
  draftInput,
  loadingQuestion,
  pendingMessage,
  onTemporaryMessagesChange,
  onPendingMessageConsumed,
  onThreadCreated,
  suspendCloseShortcut = false,
  onClose,
}: ThreadPanelProps) {
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isBusy = isLoading || Boolean(loadingQuestion);
  const activeQuestion = isBusy
    ? messages.findLast((message) => message.role === "user")?.content ?? loadingQuestion ?? null
    : null;
  const headerTitle = activeQuestion ? toSnippet(activeQuestion) : thread?.highlightedText ?? null;

  useEffect(() => {
    if (!thread || !isOpen) {
      setActiveThreadId(null);
      setInput("");
      return;
    }

    setActiveThreadId(thread.id ?? null);
    setInput(draftInput ?? "");
  }, [thread, isOpen, draftInput]);

  useEffect(() => {
    if (!thread || !isOpen) {
      setMessages([]);
      return;
    }

    if (chatMode === "temporary") {
      setMessages(temporaryMessages || initialMessages || []);
      return;
    }

    setMessages(initialMessages || []);
  }, [thread, isOpen, initialMessages, chatMode, temporaryMessages]);

  useEffect(() => {
    if (!thread || !isOpen || chatMode === "temporary" || !activeThreadId) {
      return;
    }

    let cancelled = false;

    const loadMessages = async () => {
      try {
        const res = await fetch(`/api/threads/${activeThreadId}/messages`);
        if (res.ok) {
          const data = await res.json();
          const nextMessages = mapThreadMessages((data.messages || []) as ThreadMessageRow[]);
          if (!cancelled) {
            setMessages((prev) => mergeThreadMessages(nextMessages, prev));
          }
        }
      } catch {
        // Thread may be new with no messages yet
      }
    };

    void loadMessages();

    return () => {
      cancelled = true;
    };
  }, [thread, isOpen, chatMode, activeThreadId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!isOpen || !thread) return;

    const timer = window.setTimeout(() => inputRef.current?.focus(), 300);
    return () => window.clearTimeout(timer);
  }, [isOpen, thread, draftInput]);

  const handleCloseShortcut = useCallback(
    (event: KeyboardEvent) => {
      if (suspendCloseShortcut) return;

      if (
        event.ctrlKey
        && !event.metaKey
        && !event.shiftKey
        && !event.altKey
        && event.key.toLowerCase() === "l"
      ) {
        event.preventDefault();
        onClose();
      }
    },
    [onClose, suspendCloseShortcut]
  );

  useEffect(() => {
    if (!isOpen) return;

    document.addEventListener("keydown", handleCloseShortcut);
    return () => document.removeEventListener("keydown", handleCloseShortcut);
  }, [isOpen, handleCloseShortcut]);

  const sendMessage = useCallback(async (overrideContent?: string) => {
    const content = overrideContent?.trim() || input.trim();
    const canUsePersistentThread = chatMode === "persistent" && conversationId;
    const canSend = chatMode === "temporary" || canUsePersistentThread;
    if (!content || !thread || !canSend || isBusy) return;

    const temporaryThreadId =
      chatMode === "temporary"
        ? activeThreadId ?? thread.id ?? createTemporaryId("thread")
        : null;
    const requestThreadId = temporaryThreadId ?? activeThreadId;

    if (temporaryThreadId && temporaryThreadId !== activeThreadId) {
      setActiveThreadId(temporaryThreadId);
    }

    const userMessage: ThreadMessage = {
      id: chatMode === "temporary" ? createTemporaryId("message") : Date.now().toString(),
      role: "user",
      content,
      timestamp: new Date(),
    };
    const optimisticMessages = [...messages, userMessage];

    setMessages(optimisticMessages);
    if (chatMode === "temporary" && temporaryThreadId) {
      onTemporaryMessagesChange?.(temporaryThreadId, optimisticMessages);
    }
    setInput("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: content,
          conversationId: chatMode === "persistent" ? conversationId : undefined,
          mentorId: mentorId ?? undefined,
          sourceMessageId: thread.sourceMessageId,
          highlightedText: thread.highlightedText,
          ...(requestThreadId ? { threadId: requestThreadId } : {}),
          chatMode,
          ...(chatMode === "temporary"
            ? {
                memoryMode,
                history: toChatHistory(conversationMessages),
                threadHistory: toChatHistory(messages),
              }
            : {}),
        }),
      });

      const data = await res.json();
      if (res.ok && data.message) {
        const resolvedThreadId =
          typeof data.threadId === "string" && data.threadId.length > 0
            ? data.threadId
            : requestThreadId;

        if (resolvedThreadId) {
          setActiveThreadId(resolvedThreadId);
          onThreadCreated?.(resolvedThreadId, thread.sourceMessageId, thread.highlightedText);
        }

        const assistantMessage: ThreadMessage = {
          id:
            chatMode === "temporary"
              ? createTemporaryId("message")
              : data.assistantMessageId || (Date.now() + 1).toString(),
          role: "assistant",
          content: data.message,
          timestamp: new Date(),
        };
        setMessages((prev) => {
          const updated = data.userMessageId
            ? prev.map((message) =>
                message.id === userMessage.id ? { ...message, id: data.userMessageId } : message
              )
            : prev;
          const nextMessages = [...updated, assistantMessage];
          if (chatMode === "temporary" && temporaryThreadId) {
            onTemporaryMessagesChange?.(temporaryThreadId, nextMessages);
          }
          return nextMessages;
        });
      } else {
        const errMessage: ThreadMessage = {
          id:
            chatMode === "temporary"
              ? createTemporaryId("message")
              : (Date.now() + 1).toString(),
          role: "assistant",
          content: data.error || "Something went wrong.",
          timestamp: new Date(),
        };
        setMessages((prev) => {
          const nextMessages = [...prev, errMessage];
          if (chatMode === "temporary" && temporaryThreadId) {
            onTemporaryMessagesChange?.(temporaryThreadId, nextMessages);
          }
          return nextMessages;
        });
      }
    } catch {
      const errorMessage: ThreadMessage = {
        id:
          chatMode === "temporary"
            ? createTemporaryId("message")
            : (Date.now() + 1).toString(),
        role: "assistant",
        content: "Something went wrong.",
        timestamp: new Date(),
      };
      setMessages((prev) => {
        const nextMessages = [...prev, errorMessage];
        if (chatMode === "temporary" && temporaryThreadId) {
          onTemporaryMessagesChange?.(temporaryThreadId, nextMessages);
        }
        return nextMessages;
      });
    } finally {
      setIsLoading(false);
    }
  }, [
    activeThreadId,
    chatMode,
    conversationId,
    conversationMessages,
    input,
    isBusy,
    isLoading,
    memoryMode,
    mentorId,
    messages,
    onThreadCreated,
    onTemporaryMessagesChange,
    thread,
  ]);

  // Auto-send pending message from popover graduation
  const lastPendingSignatureRef = useRef<string | null>(null);
  useEffect(() => {
    const pendingSignature =
      pendingMessage && thread
        ? `${thread.id ?? "draft"}:${thread.sourceMessageId}:${thread.highlightedText}:${pendingMessage}`
        : null;

    if (!pendingSignature) {
      lastPendingSignatureRef.current = null;
      return;
    }

    const canUseChat = chatMode === "temporary" || conversationId;
    if (isOpen && thread && canUseChat && lastPendingSignatureRef.current !== pendingSignature) {
      lastPendingSignatureRef.current = pendingSignature;
      void sendMessage(pendingMessage ?? undefined);
      onPendingMessageConsumed?.();
    }
  }, [pendingMessage, isOpen, thread, conversationId, chatMode, sendMessage, onPendingMessageConsumed]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div
      className="pointer-events-none fixed inset-0 z-50 flex justify-end transition-all duration-300"
    >
      <div
        className={`absolute inset-0 bg-foreground/[0.06] transition-opacity duration-300 lg:hidden ${
          isOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
      />

      <aside
        data-testid="thread-panel"
        data-state={isOpen ? "open" : "closed"}
        aria-hidden={!isOpen}
        className={`pointer-events-auto relative flex h-full w-full max-w-[460px] flex-col bg-background shadow-xl transition-transform duration-300 ease-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-start justify-between border-b border-border-subtle px-6 py-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-xs font-medium tracking-wider text-muted/60">
                {activeQuestion ? "FOLLOW-UP" : "THREAD"}
              </p>
              {temporaryChatEnabled && (
                <span className="inline-flex items-center rounded-full border border-border-subtle bg-foreground/[0.05] px-2 py-0.5 text-[10px] font-medium text-foreground">
                  Temporary
                </span>
              )}
            </div>
            {headerTitle && (
              <p className="mt-1 text-sm text-foreground line-clamp-2">
                &ldquo;{headerTitle}&rdquo;
              </p>
            )}
            {activeQuestion && thread && (
              <p className="mt-2 text-xs leading-relaxed text-muted/80 line-clamp-2">
                From &ldquo;{thread.highlightedText}&rdquo;
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            data-testid="thread-panel-close"
            aria-label="Close"
            className="ml-4 inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-muted transition hover:text-foreground"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div
          className="flex-1 overflow-y-auto px-6 py-4"
          style={{
            scrollbarWidth: "thin",
            scrollbarColor:
              "color-mix(in srgb, var(--foreground) 18%, transparent) transparent",
          }}
        >
          {messages.map((message) => (
            <div key={message.id} className="py-3">
              <span className="text-xs font-medium tracking-wider text-muted">
                {message.role === "user" ? "You" : "Thread"}
              </span>
              <div className={`${markdownContentClassName} mt-1 text-sm leading-relaxed text-foreground`}>
                <MarkdownWithThreads
                  content={message.content}
                  threads={[]}
                  onThreadClick={() => {}}
                />
              </div>
            </div>
          ))}

          {isBusy && (
            <div data-testid="thread-panel-loading" className="py-3">
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

        <div className="border-t border-border-subtle px-6 py-4">
          <div className="flex items-center gap-2 rounded-xl bg-surface px-4 py-2 shadow-sm ring-1 ring-border-subtle">
            <input
              ref={inputRef}
              data-testid="thread-panel-input"
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a follow-up..."
              disabled={isBusy}
              className="w-full bg-transparent py-1 text-sm text-foreground placeholder-muted/50 outline-none disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => sendMessage()}
              disabled={!input.trim() || isBusy}
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

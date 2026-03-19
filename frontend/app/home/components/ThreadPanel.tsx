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
  id: string;
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
  pendingMessage?: string | null;
  onTemporaryMessagesChange?: (threadId: string, messages: ThreadMessage[]) => void;
  onPendingMessageConsumed?: () => void;
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
  pendingMessage,
  onTemporaryMessagesChange,
  onPendingMessageConsumed,
  onClose,
}: ThreadPanelProps) {
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeQuestion = isLoading
    ? messages.findLast((message) => message.role === "user")?.content ?? null
    : null;
  const headerTitle = activeQuestion ? toSnippet(activeQuestion) : thread?.highlightedText ?? null;

  useEffect(() => {
    if (!thread || !isOpen) {
      setMessages([]);
      setInput("");
      return;
    }

    if (chatMode === "temporary") {
      setMessages(temporaryMessages || initialMessages || []);
      return;
    }

    setMessages(initialMessages || []);
    let cancelled = false;

    const loadMessages = async () => {
      try {
        const res = await fetch(`/api/threads/${thread.id}/messages`);
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
  }, [thread, isOpen, initialMessages, chatMode, temporaryMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  const sendMessage = useCallback(async (overrideContent?: string) => {
    const content = overrideContent?.trim() || input.trim();
    const canUsePersistentThread = chatMode === "persistent" && conversationId;
    const canSend = chatMode === "temporary" || canUsePersistentThread;
    if (!content || !thread || !canSend || isLoading) return;

    const userMessage: ThreadMessage = {
      id: chatMode === "temporary" ? createTemporaryId("message") : Date.now().toString(),
      role: "user",
      content,
      timestamp: new Date(),
    };
    const optimisticMessages = [...messages, userMessage];

    setMessages(optimisticMessages);
    if (chatMode === "temporary") {
      onTemporaryMessagesChange?.(thread.id, optimisticMessages);
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
          threadId: thread.id,
          sourceMessageId: thread.sourceMessageId,
          highlightedText: thread.highlightedText,
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
          if (chatMode === "temporary") {
            onTemporaryMessagesChange?.(thread.id, nextMessages);
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
          if (chatMode === "temporary") {
            onTemporaryMessagesChange?.(thread.id, nextMessages);
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
        if (chatMode === "temporary") {
          onTemporaryMessagesChange?.(thread.id, nextMessages);
        }
        return nextMessages;
      });
    } finally {
      setIsLoading(false);
    }
  }, [
    chatMode,
    conversationId,
    conversationMessages,
    input,
    isLoading,
    memoryMode,
    mentorId,
    messages,
    onTemporaryMessagesChange,
    thread,
  ]);

  // Auto-send pending message from popover graduation
  const pendingHandled = useRef(false);
  useEffect(() => {
    const canUseChat = chatMode === "temporary" || conversationId;
    if (pendingMessage && isOpen && thread && canUseChat && !pendingHandled.current) {
      pendingHandled.current = true;
      sendMessage(pendingMessage);
      onPendingMessageConsumed?.();
    }
    if (!pendingMessage) {
      pendingHandled.current = false;
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
        className={`absolute inset-0 bg-black/20 transition-opacity duration-300 lg:hidden ${
          isOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
      />

      <aside
        className={`pointer-events-auto relative flex h-full w-full max-w-[460px] flex-col bg-background shadow-xl transition-transform duration-300 ease-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-start justify-between border-b border-black/[0.06] px-6 py-4 dark:border-white/[0.06]">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-xs font-medium tracking-wider text-muted/60">
                {activeQuestion ? "FOLLOW-UP" : "THREAD"}
              </p>
              {temporaryChatEnabled && (
                <span className="inline-flex items-center rounded-full border border-slate-500/20 bg-[#C9CDD3] px-2 py-0.5 text-[10px] font-medium text-slate-900 dark:border-white/10 dark:bg-stone-800 dark:text-stone-100">
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
          style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(0,0,0,0.08) transparent" }}
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
              onClick={() => sendMessage()}
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

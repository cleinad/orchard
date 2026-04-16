"use client";

import { useEffect, useRef, useCallback, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import MarkdownWithThreads from "@/app/home/components/MarkdownWithThreads";
import SearchSourcesTray from "@/app/home/components/SearchSourcesTray";
import type { ThreadSession } from "@/app/home/components/threadTypes";
import { markdownContentClassName } from "@/lib/markdown";

interface ThreadPanelProps {
  isOpen: boolean;
  session: ThreadSession | null;
  temporaryChatEnabled: boolean;
  suspendCloseShortcut?: boolean;
  onInputChange: (sessionId: string, value: string) => void;
  onSend: (sessionId: string, overrideContent?: string) => void;
  onClose: () => void;
}

function toSnippet(text: string, maxLength = 88): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
}

export default function ThreadPanel({
  isOpen,
  session,
  temporaryChatEnabled,
  suspendCloseShortcut = false,
  onInputChange,
  onSend,
  onClose,
}: ThreadPanelProps) {
  const [openSourceTray, setOpenSourceTray] = useState<{
    messageId: string;
    sourceId: number | null;
  } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isBusy = Boolean(session && (session.status === "loading" || session.isHydrating));
  const activeQuestion = isBusy
    ? session?.messages.findLast((message) => message.role === "user")?.content ?? null
    : null;
  const headerTitle = activeQuestion ? toSnippet(activeQuestion) : session?.highlightedText ?? null;
  const canSend = Boolean(session && !isBusy && session.draftInput.trim().length > 0);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [session?.messages]);

  useEffect(() => {
    if (!isOpen || !session) return;

    const timer = window.setTimeout(() => inputRef.current?.focus(), 300);
    return () => window.clearTimeout(timer);
  }, [isOpen, session?.sessionId]);

  useEffect(() => {
    if (isOpen) {
      return;
    }

    setOpenSourceTray(null);
  }, [isOpen]);

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

  const handleKeyDown = (event: ReactKeyboardEvent) => {
    if (event.key === "Enter" && !event.shiftKey && session) {
      event.preventDefault();
      onSend(session.sessionId);
    }
  };

  const handleCitationClick = useCallback((messageId: string, sourceId: number) => {
    setOpenSourceTray((current) => {
      if (current?.messageId === messageId && current.sourceId === sourceId) {
        return null;
      }

      return {
        messageId,
        sourceId,
      };
    });
  }, []);

  const handleSourcesToggle = useCallback((messageId: string, sourceId: number) => {
    setOpenSourceTray((current) =>
      current?.messageId === messageId
        ? null
        : {
            messageId,
            sourceId,
          }
    );
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex justify-end transition-all duration-300">
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
              <p className="mt-1 line-clamp-2 text-sm text-foreground">
                &ldquo;{headerTitle}&rdquo;
              </p>
            )}
            {activeQuestion && session && (
              <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted/80">
                From &ldquo;{session.highlightedText}&rdquo;
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
          {session?.messages.map((message) => (
            <div key={message.id} className="py-3">
              <span className="text-xs font-medium tracking-wider text-muted">
                {message.role === "user" ? "You" : "Thread"}
              </span>
              <div className={`${markdownContentClassName} mt-1 text-sm leading-relaxed text-foreground`}>
                <MarkdownWithThreads
                  content={message.content}
                  threads={[]}
                  onThreadClick={() => {}}
                  searchMetadata={message.searchMetadata ?? null}
                  activeCitationSourceId={
                    openSourceTray?.messageId === message.id
                      ? openSourceTray.sourceId ?? message.searchMetadata?.sources[0]?.id ?? null
                      : null
                  }
                  onCitationClick={
                    message.searchMetadata?.status === "success"
                      ? (sourceId) => handleCitationClick(message.id, sourceId)
                      : undefined
                  }
                />
              </div>
              {message.searchMetadata?.status === "success"
                && message.searchMetadata.sources.length > 0 && (
                  <>
                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleSourcesToggle(
                            message.id,
                            message.searchMetadata?.sources[0]?.id ?? 1
                          );
                        }}
                        onPointerUp={(event) => event.stopPropagation()}
                        className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                          openSourceTray?.messageId === message.id
                            ? "border-foreground/15 bg-foreground/[0.05] text-foreground"
                            : "border-border-subtle text-muted hover:bg-foreground/[0.04] hover:text-foreground"
                        }`}
                      >
                        Sources {message.searchMetadata.sources.length}
                      </button>
                    </div>

                    {openSourceTray?.messageId === message.id && (
                      <SearchSourcesTray
                        searchMetadata={message.searchMetadata}
                        activeSourceId={
                          openSourceTray.sourceId ?? message.searchMetadata.sources[0]?.id ?? null
                        }
                        onSourceSelect={(sourceId) =>
                          setOpenSourceTray({
                            messageId: message.id,
                            sourceId,
                          })
                        }
                      />
                    )}
                  </>
                )}
            </div>
          ))}

          {isBusy && (
            <div data-testid="thread-panel-loading" className="flex items-center gap-1.5 py-2">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted/40" style={{ animationDelay: "0ms" }} />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted/40" style={{ animationDelay: "150ms" }} />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted/40" style={{ animationDelay: "300ms" }} />
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <div className="border-t border-border-subtle px-6 py-4">
          <div className="flex items-center gap-3">
            <input
              ref={inputRef}
              data-testid="thread-panel-input"
              type="text"
              value={session?.draftInput ?? ""}
              onChange={(event) => {
                if (session) {
                  onInputChange(session.sessionId, event.target.value);
                }
              }}
              onKeyDown={handleKeyDown}
              placeholder={session ? "Ask a follow-up..." : "Select text to start a thread"}
              disabled={!session}
              className="w-full rounded-lg bg-foreground/5 px-3 py-2 text-sm text-foreground placeholder-muted/50 outline-none focus:ring-1 focus:ring-foreground/10 disabled:cursor-not-allowed disabled:opacity-60"
            />
            <button
              type="button"
              data-testid="thread-panel-send"
              onClick={() => {
                if (session) {
                  onSend(session.sessionId);
                }
              }}
              disabled={!canSend}
              className="inline-flex h-10 flex-shrink-0 items-center justify-center rounded-lg bg-foreground px-4 text-sm font-medium text-background transition hover:bg-foreground/90 disabled:cursor-not-allowed disabled:bg-foreground/20 disabled:text-foreground/45"
            >
              Send
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}

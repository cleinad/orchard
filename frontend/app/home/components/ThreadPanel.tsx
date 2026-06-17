"use client";

import {
  useEffect,
  useRef,
  useCallback,
  useState,
  type FormEvent as ReactFormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import MarkdownWithThreads from "@/app/home/components/MarkdownWithThreads";
import SearchSourcesTray from "@/app/home/components/SearchSourcesTray";
import type { ThreadSession } from "@/app/home/components/threadTypes";
import { markdownContentClassName } from "@/lib/markdown";
import { hasUsableSearchSources } from "@/lib/search-citations";

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
  const textareaRef = useRef<HTMLTextAreaElement>(null);
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

    const timer = window.setTimeout(() => textareaRef.current?.focus(), 300);
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

  // Match main composer: auto-grow textarea up to max height (see ChatComposer + page.tsx `input` effect).
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [session?.draftInput]);

  const handleComposerSubmit = (event: ReactFormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (session && canSend) {
      onSend(session.sessionId);
    }
  };

  const handleComposerKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    // Same as main chat: plain Enter never inserts a newline; Shift+Enter does.
    if (event.key === "Enter" && !event.shiftKey && session) {
      event.preventDefault();
      if (canSend) {
        onSend(session.sessionId);
      }
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
        className={`pointer-events-auto relative flex h-full w-full max-w-[460px] flex-col bg-background font-sans shadow-xl transition-transform duration-300 ease-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-start justify-between border-b border-border-subtle px-6 py-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <p className="text-xs font-medium tracking-wider text-muted/60">
                {activeQuestion ? "Follow-up" : "Thread"}
              </p>
              {temporaryChatEnabled && (
                <>
                  {/* Divider + plain label: avoids pill chrome while staying scannable */}
                  <span className="h-3 w-px shrink-0 bg-border-subtle" aria-hidden />
                  <span className="text-[10px] font-medium tracking-wide text-muted/70">Temporary</span>
                </>
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
              <div
                className={`${markdownContentClassName} mt-1 text-sm leading-relaxed text-foreground font-reading`}
              >
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
                    hasUsableSearchSources(message.searchMetadata)
                      ? (sourceId) => handleCitationClick(message.id, sourceId)
                      : undefined
                  }
                />
              </div>
              {hasUsableSearchSources(message.searchMetadata) && message.searchMetadata && (
                  <>
                    <div className="mt-2">
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
                        className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs transition-colors ${
                          openSourceTray?.messageId === message.id
                            ? "border-foreground/15 bg-foreground/[0.04] text-foreground"
                            : "border-transparent text-muted hover:border-border-subtle hover:bg-foreground/[0.025] hover:text-foreground"
                        }`}
                      >
                        <span>Sources</span>
                        <span className="text-current/55">{message.searchMetadata.sources.length}</span>
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
          <form onSubmit={handleComposerSubmit} className="relative">
            <div className="relative rounded-lg bg-surface shadow-sm ring-1 ring-border-subtle">
              <textarea
                ref={textareaRef}
                data-testid="thread-panel-input"
                rows={1}
                value={session?.draftInput ?? ""}
                onChange={(event) => {
                  if (session) {
                    onInputChange(session.sessionId, event.target.value);
                  }
                }}
                onKeyDown={handleComposerKeyDown}
                placeholder={session ? "Ask a follow-up..." : "Select text to start a thread"}
                disabled={!session}
                className="composer-scrollbar w-full min-h-10 min-w-0 resize-none bg-transparent pl-3 pr-12 py-2.5 font-sans text-sm leading-relaxed text-foreground placeholder-muted/50 outline-none disabled:cursor-not-allowed disabled:opacity-50 overflow-y-auto"
                style={{ maxHeight: "200px" }}
              />
              {/* Centered on the composer height: bottom-1.5 looked low vs one-line text (no mic column). */}
              <div className="pointer-events-none absolute inset-y-0 right-2 flex w-7 items-center justify-center">
                <button
                  type="submit"
                  data-testid="thread-panel-send"
                  aria-label="Send"
                  disabled={!canSend}
                  className="pointer-events-auto flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-foreground p-0 text-background transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-20"
                >
                  <svg
                    className="h-3 w-3"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                    aria-hidden
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 10l7-7m0 0l7 7m-7-7v18"
                    />
                  </svg>
                </button>
              </div>
            </div>
          </form>
        </div>
      </aside>
    </div>
  );
}

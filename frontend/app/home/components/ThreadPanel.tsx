"use client";

import {
  useEffect,
  useRef,
  useCallback,
  useState,
  type CSSProperties,
  type FormEvent as ReactFormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import MarkdownWithThreads from "@/app/home/components/MarkdownWithThreads";
import ChatMessageFrame, {
  chatMessageContentClassName,
} from "@/app/home/components/ChatMessageFrame";
import SearchSourcesTray from "@/app/home/components/SearchSourcesTray";
import type { ThreadSession } from "@/app/home/components/threadTypes";
import { SIDE_PANEL_COLLAPSED_WIDTH_PX } from "@/app/home/components/SidePanelContext";
import { hasUsableSearchSources } from "@/lib/search-citations";
import { buttonStyles, cx } from "@/app/components/buttonStyles";

interface ThreadPanelProps {
  isOpen: boolean;
  widthPx: number;
  session: ThreadSession | null;
  temporaryChatEnabled: boolean;
  suspendCloseShortcut?: boolean;
  onWidthChange: (widthPx: number) => void;
  onInputChange: (sessionId: string, value: string) => void;
  onSend: (sessionId: string, overrideContent?: string) => void;
  onStop?: (sessionId: string) => void;
  onClose: () => void;
}

const THREAD_PANEL_DESKTOP_MEDIA_QUERY = "(min-width: 768px)";
export const THREAD_PANEL_MIN_WIDTH_PX = 200;
export const THREAD_PANEL_DEFAULT_WIDTH_PX = 460;
export const THREAD_PANEL_MAX_WIDTH_PX = 720;

export function clampThreadPanelWidthPx(value: number) {
  if (!Number.isFinite(value)) {
    return THREAD_PANEL_DEFAULT_WIDTH_PX;
  }

  return Math.min(THREAD_PANEL_MAX_WIDTH_PX, Math.max(THREAD_PANEL_MIN_WIDTH_PX, Math.round(value)));
}

function toSnippet(text: string, maxLength = 88): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
}

export default function ThreadPanel({
  isOpen,
  widthPx,
  session,
  temporaryChatEnabled,
  suspendCloseShortcut = false,
  onWidthChange,
  onInputChange,
  onSend,
  onStop,
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
  const panelStyle = {
    "--thread-panel-width": `${widthPx}px`,
  } as CSSProperties;

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

  const handleStartResize = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!isOpen || !window.matchMedia(THREAD_PANEL_DESKTOP_MEDIA_QUERY).matches) {
        return;
      }

      const previousBodyCursor = document.body.style.cursor;
      const previousBodyUserSelect = document.body.style.userSelect;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const handlePointerMove = (moveEvent: globalThis.PointerEvent) => {
        onWidthChange(clampThreadPanelWidthPx(window.innerWidth - moveEvent.clientX));
      };

      const handlePointerUp = () => {
        document.body.style.cursor = previousBodyCursor;
        document.body.style.userSelect = previousBodyUserSelect;
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
        window.removeEventListener("pointercancel", handlePointerUp);
      };

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
      window.addEventListener("pointercancel", handlePointerUp);
      event.preventDefault();
    },
    [isOpen, onWidthChange]
  );

  const handleResizeKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (!isOpen) {
        return;
      }

      if (event.key === "Home") {
        onWidthChange(THREAD_PANEL_MIN_WIDTH_PX);
        event.preventDefault();
        return;
      }

      if (event.key === "End") {
        onWidthChange(THREAD_PANEL_MAX_WIDTH_PX);
        event.preventDefault();
        return;
      }

      const direction = event.key === "ArrowLeft" ? 1 : event.key === "ArrowRight" ? -1 : 0;
      if (direction === 0) {
        return;
      }

      const step = event.shiftKey ? 24 : 12;
      onWidthChange(widthPx + direction * step);
      event.preventDefault();
    },
    [isOpen, onWidthChange, widthPx]
  );

  return (
    <div className="thread-panel-overlay pointer-events-none fixed bottom-0 right-0 top-0 z-50 flex justify-end transition-all duration-300">
      <div
        className={`thread-panel-backdrop absolute inset-0 bg-foreground/[0.06] transition-opacity duration-300 ${
          isOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
      />

      <aside
        data-testid="thread-panel"
        data-state={isOpen ? "open" : "closed"}
        aria-hidden={!isOpen}
        className={`thread-panel-surface pointer-events-auto relative flex h-full flex-col bg-background font-sans shadow-xl transition-[transform,width] duration-300 ease-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
        style={panelStyle}
      >
        <div
          role="separator"
          aria-label="Resize thread panel"
          aria-orientation="vertical"
          aria-valuemin={THREAD_PANEL_MIN_WIDTH_PX}
          aria-valuemax={THREAD_PANEL_MAX_WIDTH_PX}
          aria-valuenow={widthPx}
          tabIndex={isOpen ? 0 : -1}
          data-testid="thread-panel-resize-handle"
          onPointerDown={handleStartResize}
          onKeyDown={handleResizeKeyDown}
          className={`thread-panel-resize-handle group absolute inset-y-0 left-[-3px] z-20 hidden w-2 cursor-col-resize items-stretch justify-center outline-none ${
            isOpen ? "pointer-events-auto" : "pointer-events-none"
          }`}
        >
          <span className="my-4 w-px rounded-full bg-transparent transition-colors group-hover:bg-foreground/20 group-focus-visible:bg-foreground/30" />
        </div>

        <div className="flex items-start justify-between border-b border-border-subtle px-4 py-3 md:px-6 md:py-4">
          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={onClose}
              data-testid="thread-panel-back-main"
              aria-label="Back to main chat"
              className={cx(
                "mb-2 inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-muted md:hidden",
                buttonStyles.transition,
                buttonStyles.focus,
                buttonStyles.ghost
              )}
            >
              <svg
                aria-hidden="true"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                viewBox="0 0 20 20"
              >
                <path d="M12.5 5 7.5 10l5 5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>Main</span>
            </button>
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
            className={cx(
              "ml-4 hidden h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg md:inline-flex",
              buttonStyles.transition,
              buttonStyles.focus,
              buttonStyles.ghost
            )}
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div
          className="flex-1 overflow-y-auto px-4 py-4 md:px-6"
          style={{
            scrollbarWidth: "thin",
            scrollbarColor:
              "color-mix(in srgb, var(--foreground) 18%, transparent) transparent",
          }}
        >
          {session?.messages.map((message) => (
            <ChatMessageFrame key={message.id} messageRole={message.role}>
              <div
                className={chatMessageContentClassName(message.role)}
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
                      className={cx(
                        "inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs",
                        buttonStyles.transition,
                        buttonStyles.focus,
                        openSourceTray?.messageId === message.id
                          ? "border-foreground/15 bg-foreground/[0.04] text-foreground"
                          : "border-transparent hover:border-border-subtle",
                        openSourceTray?.messageId === message.id
                          ? null
                          : buttonStyles.ghostSubtle
                      )}
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
            </ChatMessageFrame>
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

        <div className="border-t border-border-subtle px-4 py-3 md:px-6 md:py-4">
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
                  type={isBusy ? "button" : "submit"}
                  onClick={isBusy && session ? () => onStop?.(session.sessionId) : undefined}
                  data-testid="thread-panel-send"
                  aria-label={isBusy ? "Stop response" : "Send"}
                  disabled={isBusy ? !onStop : !canSend}
                  className={cx(
                    "pointer-events-auto flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md p-0",
                    buttonStyles.primary,
                    buttonStyles.focus
                  )}
                >
                  {isBusy ? (
                    <span className="h-2.5 w-2.5 rounded-[2px] bg-current" />
                  ) : <svg
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
                  </svg>}
                </button>
              </div>
            </div>
          </form>
          <p className="mt-2 px-1 text-[11px] leading-snug text-muted/55">
            Uses the main chat model settings.
          </p>
        </div>
      </aside>

      <style jsx>{`
        .thread-panel-overlay {
          left: ${SIDE_PANEL_COLLAPSED_WIDTH_PX}px;
          max-width: calc(100dvw - ${SIDE_PANEL_COLLAPSED_WIDTH_PX}px);
        }

        .thread-panel-surface {
          width: 100%;
          max-width: 100%;
        }

        @media ${THREAD_PANEL_DESKTOP_MEDIA_QUERY} {
          .thread-panel-overlay {
            left: 0;
            max-width: none;
          }

          .thread-panel-backdrop {
            display: none;
          }

          .thread-panel-surface {
            width: min(var(--thread-panel-width), calc(100vw - 5rem));
          }

          .thread-panel-resize-handle {
            display: flex;
          }
        }
      `}</style>
    </div>
  );
}

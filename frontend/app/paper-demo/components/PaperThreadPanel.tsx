"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import MarkdownWithThreads from "@/app/home/components/MarkdownWithThreads";
import type { DocumentThreadSession } from "@/app/paper-demo/documentThreadTypes";

export const PAPER_THREAD_PANEL_DEFAULT_WIDTH_PX = 460;
const PAPER_THREAD_PANEL_MIN_WIDTH_PX = 300;
const PAPER_THREAD_PANEL_MAX_WIDTH_PX = 720;

function PanelIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

interface PaperThreadPanelProps {
  isOpen: boolean;
  widthPx: number;
  session: DocumentThreadSession | null;
  onWidthChange: (value: number) => void;
  onShowOnPage: (session: DocumentThreadSession) => void;
  onClose: () => void;
}

function clampWidth(value: number) {
  return Math.min(
    PAPER_THREAD_PANEL_MAX_WIDTH_PX,
    Math.max(PAPER_THREAD_PANEL_MIN_WIDTH_PX, Math.round(value))
  );
}

function prefersReducedMotion() {
  return (
    typeof window !== "undefined"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * One region thread: crop thumbnail, page metadata, the question, and a single
 * answer. There is no text quote, because the source is an image region.
 */
export default function PaperThreadPanel({
  isOpen,
  widthPx,
  session,
  onWidthChange,
  onShowOnPage,
  onClose,
}: PaperThreadPanelProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const [isResizing, setIsResizing] = useState(false);
  const style = { "--paper-thread-panel-width": `${widthPx}px` } as CSSProperties;

  useEffect(() => {
    endRef.current?.scrollIntoView({
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  }, [session?.answer, session?.status]);

  useEffect(() => {
    if (!isOpen) return;
    const handleShortcut = (event: KeyboardEvent) => {
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
    };
    document.addEventListener("keydown", handleShortcut);
    return () => document.removeEventListener("keydown", handleShortcut);
  }, [isOpen, onClose]);

  const handleStartResize = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (window.innerWidth < 768) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      setIsResizing(true);
      const startX = event.clientX;
      const startWidth = widthPx;
      const handleMove = (moveEvent: PointerEvent) => {
        onWidthChange(clampWidth(startWidth + startX - moveEvent.clientX));
      };
      const handleEnd = () => {
        setIsResizing(false);
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleEnd);
      };
      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleEnd);
    },
    [onWidthChange, widthPx]
  );
  const handleResizeKeyDown = (
    event: ReactKeyboardEvent<HTMLDivElement>
  ) => {
    let nextWidth: number | null = null;
    if (event.key === "ArrowLeft") nextWidth = widthPx - 16;
    if (event.key === "ArrowRight") nextWidth = widthPx + 16;
    if (event.key === "Home") nextWidth = PAPER_THREAD_PANEL_MIN_WIDTH_PX;
    if (event.key === "End") nextWidth = PAPER_THREAD_PANEL_MAX_WIDTH_PX;
    if (nextWidth === null) return;
    event.preventDefault();
    onWidthChange(clampWidth(nextWidth));
  };

  if (!isOpen || !session) return null;

  const pageNumber = session.anchor.pageIndex + 1;

  return (
    <aside
      style={style}
      className="paper-thread-panel"
      aria-label="Document region thread"
      data-testid="paper-thread-panel"
    >
      <div
        role="separator"
        tabIndex={0}
        aria-orientation="vertical"
        aria-label="Resize paper thread"
        aria-valuemin={PAPER_THREAD_PANEL_MIN_WIDTH_PX}
        aria-valuemax={PAPER_THREAD_PANEL_MAX_WIDTH_PX}
        aria-valuenow={widthPx}
        onPointerDown={handleStartResize}
        onKeyDown={handleResizeKeyDown}
        className={`paper-thread-panel-resizer ${isResizing ? "is-resizing" : ""}`}
      />
      <header className="paper-thread-panel-header">
        <div className="min-w-0">
          <p className="paper-kicker">
            Highlight {session.index} · Page {pageNumber}
          </p>
          <h2 className="truncate text-sm font-medium text-foreground">
            {session.documentName}
          </h2>
        </div>
        <button
          type="button"
          className="paper-icon-button"
          aria-label="Close paper thread"
          onClick={onClose}
        >
          <PanelIcon><path d="m6 6 12 12M18 6 6 18" /></PanelIcon>
        </button>
      </header>

      <button
        type="button"
        onClick={() => onShowOnPage(session)}
        className="paper-show-on-page"
      >
        <PanelIcon><circle cx="12" cy="12" r="3" /><path d="M12 2v3m0 14v3M2 12h3m14 0h3" /></PanelIcon>
        Show on page
      </button>

      <div className="paper-thread-messages" aria-live="polite">
        <figure className="paper-thread-crop">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={session.cropUrl}
            alt={`Highlighted region on page ${pageNumber}`}
            data-testid="paper-thread-crop"
          />
          <figcaption>
            Region from page {pageNumber} · {session.crop.width}×
            {session.crop.height} px
          </figcaption>
        </figure>

        <article className="paper-thread-message paper-thread-message-user">
          <p className="paper-thread-message-label">You</p>
          <p>{session.question}</p>
        </article>

        {session.status === "loading" ? (
          <div className="paper-thread-thinking" role="status">
            <span />
            <span />
            <span />
            Thinking
          </div>
        ) : null}

        {session.status === "ready" && session.answer ? (
          <article className="paper-thread-message paper-thread-message-assistant">
            <p className="paper-thread-message-label">Orchard</p>
            <MarkdownWithThreads
              content={session.answer}
              threads={[]}
              onThreadClick={() => undefined}
            />
          </article>
        ) : null}

        {session.status === "error" ? (
          <p className="paper-thread-error" role="alert">
            {session.answer ?? "This region question could not be answered."}
          </p>
        ) : null}
        <div ref={endRef} />
      </div>
    </aside>
  );
}

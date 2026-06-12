"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import type { ThreadSource } from "@/app/home/components/threadTypes";

export interface PopoverState extends ThreadSource {
  anchorRect: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  selectedText: string;
}

interface TextSelectionPopoverProps {
  popoverState: PopoverState | null;
  onDismiss: () => void;
  onSubmitQuestion: (source: ThreadSource, question: string) => void;
  onOpenThreadDraft: (source: ThreadSource, draftInput: string) => void;
}

export default function TextSelectionPopover({
  popoverState,
  onDismiss,
  onSubmitQuestion,
  onOpenThreadDraft,
}: TextSelectionPopoverProps) {
  const [customQuestion, setCustomQuestion] = useState("");
  const [fallbackPlacement, setFallbackPlacement] = useState<"top" | "bottom">("top");
  const [fallbackLeft, setFallbackLeft] = useState<number | null>(null);
  const [supportsAnchorPositioning, setSupportsAnchorPositioning] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSupportsAnchorPositioning(
      typeof CSS !== "undefined"
      && CSS.supports("position-anchor: --text-selection-popover-anchor")
      && CSS.supports("position-area: top")
      && CSS.supports("position-try-order: most-height")
    );
  }, []);

  useEffect(() => {
    setCustomQuestion("");
  }, [popoverState]);

  const handleDismiss = useCallback(() => {
    onDismiss();
  }, [onDismiss]);

  useEffect(() => {
    if (!popoverState) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        handleDismiss();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        handleDismiss();
      }
    };

    document.addEventListener("keydown", handleEscape, true);

    const timer = window.setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 100);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape, true);
    };
  }, [handleDismiss, popoverState]);

  useEffect(() => {
    if (!popoverState) return;

    const isEditableTarget = (target: EventTarget | null) => {
      return (
        target instanceof HTMLElement
        && Boolean(target.closest("input, textarea, [contenteditable='true']"))
      );
    };

    const handleCopy = (event: ClipboardEvent) => {
      if (isEditableTarget(event.target)) {
        return;
      }

      event.clipboardData?.setData("text/plain", popoverState.selectedText);
      event.preventDefault();
    };

    const handleOpenThreadShortcut = (event: KeyboardEvent) => {
      if (
        !event.ctrlKey
        || event.metaKey
        || event.shiftKey
        || event.altKey
        || event.key.toLowerCase() !== "l"
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const draftInput = customQuestion.trim();
      if (!draftInput) {
        return;
      }

      onOpenThreadDraft(popoverState, draftInput);
    };

    document.addEventListener("copy", handleCopy);
    document.addEventListener("keydown", handleOpenThreadShortcut, true);
    return () => {
      document.removeEventListener("copy", handleCopy);
      document.removeEventListener("keydown", handleOpenThreadShortcut, true);
    };
  }, [customQuestion, onOpenThreadDraft, popoverState]);

  useLayoutEffect(() => {
    if (!popoverState || supportsAnchorPositioning) return;

    const popoverEl = popoverRef.current;
    if (!popoverEl) return;
    const scrollContainer =
      popoverEl.offsetParent instanceof HTMLElement ? popoverEl.offsetParent : null;
    const visibleTop = scrollContainer?.scrollTop ?? 0;
    const visibleBottom = visibleTop + (scrollContainer?.clientHeight ?? window.innerHeight);

    // Tighter offset so the slimmer popover sits closer to the selection anchor.
    const gap = 8;
    const popoverHeight = popoverEl.getBoundingClientRect().height;
    const popoverWidth = popoverEl.getBoundingClientRect().width;
    const availableAbove = popoverState.anchorRect.top - visibleTop;
    const anchorBottom = popoverState.anchorRect.top + popoverState.anchorRect.height;
    const availableBelow = visibleBottom - anchorBottom;
    const canFitAbove = availableAbove >= popoverHeight + gap;
    const canFitBelow = availableBelow >= popoverHeight + gap;

    setFallbackPlacement(
      !canFitAbove && (canFitBelow || availableBelow > availableAbove) ? "bottom" : "top"
    );

    const visibleLeft = scrollContainer?.scrollLeft ?? 0;
    const visibleRight = visibleLeft + (scrollContainer?.clientWidth ?? window.innerWidth);
    const desiredLeft = popoverState.anchorRect.left + popoverState.anchorRect.width / 2;
    const horizontalPadding = 8;
    const minLeft = visibleLeft + popoverWidth / 2 + horizontalPadding;
    const maxLeft = visibleRight - popoverWidth / 2 - horizontalPadding;
    setFallbackLeft(Math.min(Math.max(desiredLeft, minLeft), Math.max(minLeft, maxLeft)));
  }, [popoverState, supportsAnchorPositioning]);

  if (!popoverState) {
    return null;
  }

  const handleCustomSubmit = (event: FormEvent) => {
    event.preventDefault();
    const question = customQuestion.trim();
    if (!question) {
      return;
    }

    onSubmitQuestion(popoverState, question);
  };

  const fallbackStyle: CSSProperties | undefined = supportsAnchorPositioning
    ? undefined
    : {
        position: "absolute",
        left: fallbackLeft ?? popoverState.anchorRect.left + popoverState.anchorRect.width / 2,
        top:
          fallbackPlacement === "top"
            ? popoverState.anchorRect.top
            : popoverState.anchorRect.top + popoverState.anchorRect.height,
        transform:
          fallbackPlacement === "top"
            ? "translate(-50%, calc(-100% - 8px))"
            : "translate(-50%, 8px)",
        zIndex: 60,
      };

  const anchorStyle: CSSProperties = {
    position: "absolute",
    left: popoverState.anchorRect.left,
    top: popoverState.anchorRect.top,
    width: Math.max(popoverState.anchorRect.width, 1),
    height: Math.max(popoverState.anchorRect.height, 1),
  };

  return (
    <>
      <div
        aria-hidden="true"
        style={anchorStyle}
        className="text-selection-popover-anchor pointer-events-none"
      />
      <div
        ref={popoverRef}
        data-testid="selection-popover"
        onKeyDownCapture={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            handleDismiss();
          }
        }}
        style={fallbackStyle}
        className="text-selection-popover w-[min(18rem,calc(100vw-1rem))] rounded-md border border-border-subtle bg-surface/95 p-2 font-sans text-foreground shadow-[0_10px_26px_rgba(15,23,42,0.12)] outline-none backdrop-blur"
      >
        {/* Flat toolbar: hairline border + light shadow (not a heavy “card orb”). */}
        {/* UI chrome: `font-sans`; field uses `font-reading` (body font). */}
        <p className="mb-2 line-clamp-2 border-b border-border-subtle pb-1.5 text-[11px] leading-snug text-muted/75">
          &ldquo;{popoverState.selectedText}&rdquo;
        </p>

        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2">
          <form onSubmit={handleCustomSubmit} className="min-w-0 flex-1">
            <input
              data-testid="selection-popover-input"
              type="text"
              value={customQuestion}
              onChange={(event) => setCustomQuestion(event.target.value)}
              placeholder="Ask about this…"
              className="h-8 w-full rounded-md border border-border-subtle bg-foreground/[0.03] px-2.5 font-sans font-reading text-xs text-foreground placeholder:text-muted/45 outline-none transition-colors focus:border-foreground/[0.18] focus:ring-1 focus:ring-foreground/10"
            />
          </form>
        </div>
      </div>
    </>
  );
}

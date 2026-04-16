"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
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
  const [supportsNativePopover, setSupportsNativePopover] = useState(false);
  const [supportsAnchorPositioning, setSupportsAnchorPositioning] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const useNativePopover = supportsNativePopover && supportsAnchorPositioning;

  useEffect(() => {
    setSupportsNativePopover(
      typeof HTMLDivElement !== "undefined" && "showPopover" in HTMLDivElement.prototype
    );
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

  useEffect(() => {
    if (!popoverState) {
      return;
    }

    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [popoverState]);

  const handleDismiss = useCallback(() => {
    onDismiss();
  }, [onDismiss]);

  useEffect(() => {
    if (!popoverState || useNativePopover) return;

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

    const timer = window.setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEscape);
    }, 100);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [handleDismiss, popoverState, useNativePopover]);

  useEffect(() => {
    if (!popoverState || !useNativePopover || !popoverRef.current) return;

    const popoverEl = popoverRef.current;
    const handleToggle = (event: Event) => {
      const toggleEvent = event as ToggleEvent;
      if (toggleEvent.newState === "closed") {
        handleDismiss();
      }
    };

    popoverEl.addEventListener("toggle", handleToggle);
    return () => {
      popoverEl.removeEventListener("toggle", handleToggle);
    };
  }, [handleDismiss, popoverState, useNativePopover]);

  useEffect(() => {
    if (!popoverState || !useNativePopover || !popoverRef.current) return;

    const popoverEl = popoverRef.current as HTMLDivElement & {
      showPopover?: (options?: { source?: HTMLElement }) => void;
    };
    const anchorEl = anchorRef.current ?? undefined;

    if (!popoverEl.matches(":popover-open")) {
      popoverEl.showPopover?.(anchorEl ? { source: anchorEl } : undefined);
    }
  }, [popoverState, useNativePopover]);

  useEffect(() => {
    if (!popoverState) return;

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

    document.addEventListener("keydown", handleOpenThreadShortcut, true);
    return () => document.removeEventListener("keydown", handleOpenThreadShortcut, true);
  }, [customQuestion, onOpenThreadDraft, popoverState]);

  useLayoutEffect(() => {
    if (!popoverState || supportsAnchorPositioning) return;

    const popoverEl = popoverRef.current;
    if (!popoverEl) return;
    const scrollContainer =
      popoverEl.offsetParent instanceof HTMLElement ? popoverEl.offsetParent : null;
    const visibleTop = scrollContainer?.scrollTop ?? 0;
    const visibleBottom = visibleTop + (scrollContainer?.clientHeight ?? window.innerHeight);

    const gap = 12;
    const popoverHeight = popoverEl.getBoundingClientRect().height;
    const availableAbove = popoverState.anchorRect.top - visibleTop;
    const anchorBottom = popoverState.anchorRect.top + popoverState.anchorRect.height;
    const availableBelow = visibleBottom - anchorBottom;
    const canFitAbove = availableAbove >= popoverHeight + gap;
    const canFitBelow = availableBelow >= popoverHeight + gap;

    setFallbackPlacement(
      !canFitAbove && (canFitBelow || availableBelow > availableAbove) ? "bottom" : "top"
    );
  }, [popoverState, supportsAnchorPositioning]);

  if (!popoverState) {
    return null;
  }

  const handleMouseDownCapture = (event: ReactMouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, [contenteditable='true']")) {
      return;
    }

    event.preventDefault();
  };

  const handleDefine = () => {
    onSubmitQuestion(popoverState, `What is "${popoverState.selectedText}"?`);
  };

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
        left: popoverState.anchorRect.left + popoverState.anchorRect.width / 2,
        top:
          fallbackPlacement === "top"
            ? popoverState.anchorRect.top
            : popoverState.anchorRect.top + popoverState.anchorRect.height,
        transform:
          fallbackPlacement === "top"
            ? "translate(-50%, calc(-100% - 12px))"
            : "translate(-50%, 12px)",
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
        ref={anchorRef}
        aria-hidden="true"
        style={anchorStyle}
        className="text-selection-popover-anchor pointer-events-none"
      />
      <div
        ref={popoverRef}
        data-testid="selection-popover"
        popover={useNativePopover ? "auto" : undefined}
        onMouseDownCapture={handleMouseDownCapture}
        style={fallbackStyle}
        className="text-selection-popover w-[min(20rem,calc(100vw-1rem))] rounded-xl border-none bg-surface p-4 text-foreground shadow-lg ring-1 ring-black/[0.08] outline-none dark:ring-white/[0.08]"
      >
        <p className="mb-3 line-clamp-2 text-xs text-muted/60">
          &ldquo;{popoverState.selectedText}&rdquo;
        </p>

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
            data-testid="selection-popover-input"
            type="text"
            value={customQuestion}
            onChange={(event) => setCustomQuestion(event.target.value)}
            placeholder="Ask something about this..."
            className="w-full rounded-lg bg-foreground/5 px-3 py-2 text-sm text-foreground placeholder-muted/50 outline-none focus:ring-1 focus:ring-foreground/10"
          />
        </form>
      </div>
    </>
  );
}

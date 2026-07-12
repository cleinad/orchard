"use client";

import {
  cloneElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type Ref,
} from "react";
import "./tooltip.css";
import { cx } from "@/app/components/buttonStyles";

type Side = "top" | "bottom" | "left" | "right";

interface TooltipProps {
  content: ReactNode;
  side?: Side;
  delayShow?: number;
  delayHide?: number;
  clickToToggle?: boolean;
  activeClassName?: string;
  children: ReactElement<Record<string, unknown>>;
}

function mergeRefs<T>(...refs: (Ref<T> | undefined)[]) {
  return (node: T | null) => {
    for (const ref of refs) {
      if (typeof ref === "function") ref(node);
      else if (ref && typeof ref === "object")
        (ref as React.MutableRefObject<T | null>).current = node;
    }
  };
}

function composeHandlers(
  child: ((...args: unknown[]) => void) | undefined,
  ours: () => void
) {
  return (...args: unknown[]) => {
    child?.(...args);
    ours();
  };
}

export default function Tooltip({
  content,
  side = "bottom",
  delayShow = 0,
  delayHide = 0,
  clickToToggle = false,
  activeClassName,
  children,
}: TooltipProps) {
  const triggerRef = useRef<HTMLElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const popoverId = `tooltip-${useId()}`;
  const [isOpen, setIsOpen] = useState(false);
  const [isPinnedOpen, setIsPinnedOpen] = useState(false);

  const clearTimers = useCallback(() => {
    if (showTimer.current) {
      clearTimeout(showTimer.current);
      showTimer.current = null;
    }
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }, []);

  const openPopover = useCallback(() => {
    const el = popoverRef.current;
    const src = triggerRef.current;
    if (el && src && !el.matches(":popover-open")) {
      (el as unknown as { showPopover(opts?: { source: HTMLElement }): void })
        .showPopover({ source: src });
    }
    setIsOpen(true);
  }, []);

  const closePopover = useCallback(() => {
    const el = popoverRef.current;
    if (el && el.matches(":popover-open")) {
      el.hidePopover();
    }
    setIsOpen(false);
  }, []);

  const show = useCallback(() => {
    clearTimers();
    showTimer.current = setTimeout(openPopover, delayShow);
  }, [delayShow, clearTimers, openPopover]);

  const hide = useCallback(() => {
    if (isPinnedOpen) return;
    clearTimers();
    hideTimer.current = setTimeout(() => {
      closePopover();
    }, delayHide);
  }, [delayHide, clearTimers, closePopover, isPinnedOpen]);

  const toggle = useCallback(() => {
    clearTimers();
    if (isOpen && isPinnedOpen) {
      setIsPinnedOpen(false);
      closePopover();
      return;
    }
    setIsPinnedOpen(true);
    openPopover();
  }, [clearTimers, closePopover, isOpen, isPinnedOpen, openPopover]);

  const cancelHide = useCallback(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }, []);

  useEffect(() => {
    if (!clickToToggle || !isPinnedOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Node
        && !triggerRef.current?.contains(target)
        && !popoverRef.current?.contains(target)
      ) {
        setIsPinnedOpen(false);
        closePopover();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsPinnedOpen(false);
        closePopover();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [clickToToggle, closePopover, isPinnedOpen]);

  const childProps = children.props as Record<string, unknown>;
  const triggerProps: Record<string, unknown> = {
    ref: mergeRefs(triggerRef, childProps.ref as Ref<HTMLElement> | undefined),
    "aria-describedby": popoverId,
    "aria-expanded": clickToToggle ? isOpen : undefined,
    className: activeClassName
      ? cx(childProps.className as string | undefined, isOpen && activeClassName)
      : childProps.className,
    onPointerEnter: composeHandlers(
      childProps.onPointerEnter as ((...a: unknown[]) => void) | undefined,
      show
    ),
    onPointerLeave: composeHandlers(
      childProps.onPointerLeave as ((...a: unknown[]) => void) | undefined,
      hide
    ),
    onFocus: composeHandlers(
      childProps.onFocus as ((...a: unknown[]) => void) | undefined,
      show
    ),
    onBlur: composeHandlers(
      childProps.onBlur as ((...a: unknown[]) => void) | undefined,
      hide
    ),
  };

  if (clickToToggle) {
    triggerProps.onClick = composeHandlers(
      childProps.onClick as ((...a: unknown[]) => void) | undefined,
      toggle
    );
  }

  const trigger = cloneElement(children, triggerProps);

  return (
    <>
      {trigger}
      <div
        ref={popoverRef}
        id={popoverId}
        role="tooltip"
        popover="hint"
        data-side={side}
        className="tooltip-popover"
        onPointerEnter={cancelHide}
        onPointerLeave={hide}
      >
        {content}
      </div>
    </>
  );
}

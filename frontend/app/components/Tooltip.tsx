"use client";

import {
  cloneElement,
  useRef,
  useCallback,
  useId,
  type ReactElement,
  type ReactNode,
  type Ref,
} from "react";
import "./tooltip.css";

type Side = "top" | "bottom" | "left" | "right";

interface TooltipProps {
  content: ReactNode;
  side?: Side;
  delayShow?: number;
  delayHide?: number;
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
  children,
}: TooltipProps) {
  const triggerRef = useRef<HTMLElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const popoverId = `tooltip-${useId()}`;

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

  const show = useCallback(() => {
    clearTimers();
    showTimer.current = setTimeout(() => {
      const el = popoverRef.current;
      const src = triggerRef.current;
      if (el && src && !el.matches(":popover-open")) {
        (el as unknown as { showPopover(opts?: { source: HTMLElement }): void })
          .showPopover({ source: src });
      }
    }, delayShow);
  }, [delayShow, clearTimers]);

  const hide = useCallback(() => {
    clearTimers();
    hideTimer.current = setTimeout(() => {
      const el = popoverRef.current;
      if (el && el.matches(":popover-open")) {
        el.hidePopover();
      }
    }, delayHide);
  }, [delayHide, clearTimers]);

  const cancelHide = useCallback(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }, []);

  const childProps = children.props as Record<string, unknown>;

  const trigger = cloneElement(children, {
    ref: mergeRefs(triggerRef, childProps.ref as Ref<HTMLElement> | undefined),
    "aria-describedby": popoverId,
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
  });

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

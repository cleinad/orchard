"use client";

import type { ReactNode } from "react";
import Tooltip from "@/app/components/Tooltip";
import { buttonStyles, cx } from "@/app/components/buttonStyles";

type Side = "top" | "bottom" | "left" | "right";

interface IconTooltipProps {
  content: ReactNode;
  side?: Side;
  delayShow?: number;
  delayHide?: number;
  ariaLabel?: string;
  className?: string;
}

export default function IconTooltip({
  content,
  side = "bottom",
  delayShow,
  delayHide,
  ariaLabel = "More information",
  className,
}: IconTooltipProps) {
  return (
    <Tooltip
      content={content}
      side={side}
      delayShow={delayShow}
      delayHide={delayHide}
      clickToToggle
      activeClassName="border-foreground/[0.16] bg-foreground/[0.08] text-foreground"
    >
      <button
        type="button"
        aria-label={ariaLabel}
        className={cx(
          "inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border border-foreground/[0.14] bg-foreground/[0.025] font-sans text-[11px] font-bold leading-none text-foreground/70 hover:border-foreground/[0.2] hover:bg-foreground/[0.07] hover:text-foreground focus-visible:border-foreground/[0.22] focus-visible:bg-foreground/[0.07] focus-visible:text-foreground",
          buttonStyles.transition,
          buttonStyles.focus,
          className
        )}
      >
        i
      </button>
    </Tooltip>
  );
}

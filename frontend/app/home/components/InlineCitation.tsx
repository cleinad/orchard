"use client";

import type { ComponentPropsWithoutRef } from "react";
import SourceFavicon from "@/app/home/components/SourceFavicon";
import type { SearchSource } from "@/lib/search-citations";

export type InlineCitationVariant = "logoNumber" | "numberOnly";

interface InlineCitationProps
  extends Omit<ComponentPropsWithoutRef<"button">, "children" | "onClick"> {
  active: boolean;
  onClick: () => void;
  source?: SearchSource;
  sourceId: number;
  variant?: InlineCitationVariant;
}

const BASE_CLASS_NAME =
  "mx-0.5 inline-flex translate-y-[-0.08rem] select-none items-center justify-center rounded-full border align-baseline font-sans text-[11px] font-medium transition-colors";

const VARIANT_CLASS_NAMES: Record<InlineCitationVariant, string> = {
  logoNumber: "h-[1.35rem] min-w-[1.35rem] gap-1 px-1.5",
  numberOnly: "h-[1.25rem] min-w-[1.25rem] px-1",
};

function getStateClassName(active: boolean) {
  return active
    ? "border-foreground/20 bg-foreground/[0.07] text-foreground"
    : "border-border-subtle bg-surface/60 text-muted hover:bg-foreground/[0.04] hover:text-foreground";
}

export default function InlineCitation({
  active,
  className = "",
  onClick,
  source,
  sourceId,
  variant = "numberOnly",
  ...props
}: InlineCitationProps) {
  return (
    <button
      {...props}
      type="button"
      data-selection-exclude="true"
      data-testid="search-citation"
      data-source-id={sourceId}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      aria-label={
        source
          ? `View source ${sourceId}: ${source.title}`
          : `View source ${sourceId}`
      }
      aria-pressed={active}
      title={source ? `${source.title} - ${source.domain}` : undefined}
      className={`${BASE_CLASS_NAME} ${VARIANT_CLASS_NAMES[variant]} ${getStateClassName(active)} ${className}`}
    >
      {variant === "logoNumber" && source && (
        <SourceFavicon
          domain={source.domain}
          title={source.title}
          size={13}
          className="opacity-90"
        />
      )}
      <span aria-hidden="true">{sourceId}</span>
    </button>
  );
}

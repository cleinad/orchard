"use client";

import {
  useEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
} from "react";
import SourceFavicon from "@/app/home/components/SourceFavicon";
import type { SearchSource } from "@/lib/search-citations";
import { formatSourceDate } from "@/lib/source-display";

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
const PREVIEW_CLOSE_DELAY_MS = 180;

function getStateClassName(active: boolean) {
  return active
    ? "border-foreground/20 bg-foreground/[0.07] text-foreground"
    : "border-border-subtle bg-surface/60 text-muted hover:bg-foreground/[0.04] hover:text-foreground";
}

function InlineCitationPreview({
  isOpen,
  source,
}: {
  isOpen: boolean;
  source: SearchSource;
}) {
  const dateLabel = formatSourceDate(source.publishedAt);
  const metaLabel = [source.domain, dateLabel].filter(Boolean).join(" | ");

  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      data-selection-exclude="true"
      data-testid="search-citation-preview"
      onClick={(event) => event.stopPropagation()}
      aria-label={`Open source: ${source.title}`}
      style={{ textDecoration: "none" }}
      className={`absolute bottom-full left-1/2 z-50 mb-2 w-80 max-w-[calc(100vw-2rem)] -translate-x-1/2 select-none rounded-md border border-border-subtle bg-background px-3 py-2.5 text-left font-sans !no-underline shadow-lg shadow-black/10 transition duration-100 hover:!no-underline focus-visible:!no-underline dark:shadow-black/30 [&_*]:!no-underline ${
        isOpen
          ? "visible pointer-events-auto translate-y-0 opacity-100"
          : "invisible pointer-events-none translate-y-1 opacity-0"
      }`}
    >
      <span className="flex min-w-0 items-center gap-1.5 text-xs leading-none text-muted">
        <SourceFavicon domain={source.domain} title={source.title} size={14} />
        <span className="truncate">{metaLabel}</span>
      </span>
      <span className="mt-2 block text-sm font-medium leading-snug text-foreground">
        {source.title}
      </span>
      {source.snippet && (
        <span className="mt-1 block overflow-hidden text-xs leading-snug text-muted [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
          {source.snippet}
        </span>
      )}
    </a>
  );
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
  const closeTimerRef = useRef<number | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const clearCloseTimer = () => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const openPreview = () => {
    clearCloseTimer();
    setIsPreviewOpen(true);
  };

  const scheduleClosePreview = () => {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      setIsPreviewOpen(false);
      closeTimerRef.current = null;
    }, PREVIEW_CLOSE_DELAY_MS);
  };

  useEffect(() => clearCloseTimer, []);

  return (
    <span
      data-selection-exclude="true"
      onMouseEnter={openPreview}
      onMouseLeave={scheduleClosePreview}
      onFocus={openPreview}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          scheduleClosePreview();
        }
      }}
      className="group/citation relative inline-flex align-baseline"
    >
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
      {source && (
        <InlineCitationPreview isOpen={isPreviewOpen} source={source} />
      )}
    </span>
  );
}

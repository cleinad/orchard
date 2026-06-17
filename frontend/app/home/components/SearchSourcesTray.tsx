"use client";

import type { PersistedSearchMetadata } from "@/lib/chat-search";
import { hasUsableSearchSources } from "@/lib/search-citations";
import SourceFavicon from "@/app/home/components/SourceFavicon";
import { formatSourceDate } from "@/lib/source-display";

interface SearchSourcesTrayProps {
  searchMetadata: PersistedSearchMetadata;
  activeSourceId: number | null;
  onSourceSelect: (sourceId: number) => void;
}

export default function SearchSourcesTray({
  searchMetadata,
  activeSourceId,
  onSourceSelect,
}: SearchSourcesTrayProps) {
  const sources = searchMetadata.sources;
  const selectedSource =
    sources.find((source) => source.id === activeSourceId) ?? sources[0] ?? null;

  if (!hasUsableSearchSources(searchMetadata) || !selectedSource) {
    return null;
  }

  return (
    <div className="mt-2 border-l border-border-subtle pl-3 font-sans">
      <div className="space-y-2">
        {sources.map((source) => {
          const isActive = source.id === selectedSource.id;
          const dateLabel = formatSourceDate(source.publishedAt);

          return (
            <div
              key={source.id}
              className={`group flex w-full items-start gap-2.5 rounded-md transition-colors ${
                isActive
                  ? "bg-foreground/[0.04] text-foreground"
                  : "text-muted hover:bg-foreground/[0.025] hover:text-foreground"
              }`}
            >
              <button
                type="button"
                data-testid="search-source-tab"
                data-source-id={source.id}
                onClick={(event) => {
                  event.stopPropagation();
                  onSourceSelect(source.id);
                }}
                onPointerUp={(event) => event.stopPropagation()}
                className="flex min-w-0 flex-1 items-start gap-2.5 px-1.5 py-1.5 text-left"
                aria-pressed={isActive}
              >
                <SourceFavicon
                  domain={source.domain}
                  title={source.title}
                  size={16}
                  className="mt-0.5"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium leading-snug">
                    {source.title}
                  </span>
                  <span className="mt-0.5 block text-xs leading-snug text-current/62">
                    {[source.domain, source.sourceType, dateLabel]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  {isActive && source.snippet && (
                    <span className="mt-1.5 block font-reading text-sm leading-relaxed text-muted">
                      {source.snippet}
                    </span>
                  )}
                </span>
                <span className="mt-0.5 text-xs text-current/45">{source.id}</span>
              </button>
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Open source: ${source.title}`}
                title="Open source"
                onClick={(event) => event.stopPropagation()}
                onPointerUp={(event) => event.stopPropagation()}
                className="mr-1.5 mt-1.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-current/45 transition-colors hover:bg-foreground/[0.06] hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground/40"
              >
                <svg
                  className="h-3.5 w-3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.8"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path d="M14 4h6v6" />
                  <path d="M10 14 20 4" />
                  <path d="M20 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4" />
                </svg>
              </a>
            </div>
          );
        })}
      </div>
    </div>
  );
}

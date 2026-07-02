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
            <a
              key={source.id}
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="search-source-tab"
              data-source-id={source.id}
              onMouseEnter={() => onSourceSelect(source.id)}
              onFocus={() => onSourceSelect(source.id)}
              className={`group flex w-full cursor-pointer items-start gap-2.5 rounded-md px-1.5 py-1.5 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground/40 ${
                isActive
                  ? "bg-foreground/[0.04] text-foreground"
                  : "text-muted hover:bg-foreground/[0.025] hover:text-foreground"
              }`}
              aria-current={isActive ? "true" : undefined}
              aria-label={`Open source: ${source.title}`}
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
              </span>
              <span className="mt-0.5 text-xs text-current/45">{source.id}</span>
            </a>
          );
        })}
      </div>
    </div>
  );
}

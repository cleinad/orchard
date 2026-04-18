"use client";

import type { PersistedSearchMetadata } from "@/lib/chat-search";
import { hasUsableSearchSources } from "@/lib/search-citations";

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
    <div className="mt-3 rounded-2xl border border-border-subtle bg-surface/80 px-4 py-3 font-sans shadow-sm">
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
        <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
          {sources.map((source) => {
            const isActive = source.id === selectedSource.id;

            return (
              <button
                key={source.id}
                type="button"
                data-testid="search-source-tab"
                data-source-id={source.id}
                onClick={(event) => {
                  event.stopPropagation();
                  onSourceSelect(source.id);
                }}
                onPointerUp={(event) => event.stopPropagation()}
                className={`w-full rounded-2xl border px-3 py-2 text-left transition-colors ${
                  isActive
                    ? "border-foreground/15 bg-foreground/[0.06] text-foreground"
                    : "border-border-subtle text-muted hover:bg-foreground/[0.04] hover:text-foreground"
                }`}
                aria-pressed={isActive}
              >
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 inline-flex h-6 min-w-6 items-center justify-center rounded-full border border-current/15 px-2 text-[11px] font-medium">
                    {source.id}
                  </span>
                  <div className="min-w-0">
                    <p className="line-clamp-2 text-sm font-medium leading-snug text-current">
                      {source.title}
                    </p>
                    <p className="mt-1 text-[11px] uppercase tracking-[0.16em] text-current/60">
                      {source.domain}
                    </p>
                    {(source.provider || source.sourceType) && (
                      <p className="mt-1 text-[11px] text-current/65">
                        {[source.provider, source.sourceType].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="min-w-0 rounded-2xl border border-border-subtle bg-background/40 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-reading text-sm font-medium leading-snug text-foreground">
                {selectedSource.title}
              </p>
              <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-muted/70">
                {selectedSource.domain}
              </p>
              {(selectedSource.provider || selectedSource.sourceType || selectedSource.publishedAt) && (
                <p className="mt-2 text-xs text-muted">
                  {[
                    selectedSource.provider,
                    selectedSource.sourceType,
                    selectedSource.publishedAt
                      ? new Date(selectedSource.publishedAt).toLocaleDateString()
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
            </div>

            <a
              href={selectedSource.url}
              target="_blank"
              rel="noreferrer"
              onClick={(event) => event.stopPropagation()}
              className="inline-flex flex-shrink-0 items-center gap-1 rounded-full border border-border-subtle px-2.5 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-foreground/[0.04]"
            >
              Open source
            </a>
          </div>

          <p className="mt-3 font-reading text-sm leading-relaxed text-muted">
            {selectedSource.snippet}
          </p>
        </div>
      </div>
    </div>
  );
}

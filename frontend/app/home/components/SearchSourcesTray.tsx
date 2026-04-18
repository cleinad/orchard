"use client";

import type { PersistedSearchMetadata } from "@/lib/chat-search";

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

  if (searchMetadata.status !== "success" || !selectedSource) {
    return null;
  }

  return (
    <div className="mt-3 rounded-2xl border border-border-subtle bg-surface/80 px-4 py-3 shadow-sm">
      {sources.length > 1 && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
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
                className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full border px-2 text-[11px] font-medium transition-colors ${
                  isActive
                    ? "border-foreground/15 bg-foreground/[0.06] text-foreground"
                    : "border-border-subtle text-muted hover:bg-foreground/[0.04] hover:text-foreground"
                }`}
                aria-pressed={isActive}
              >
                {source.id}
              </button>
            );
          })}
        </div>
      )}

      <div className="min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium leading-snug text-foreground">
              {selectedSource.title}
            </p>
            <p className="mt-1 text-[11px] tracking-[0.18em] text-muted/70">
              {selectedSource.domain}
            </p>
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

        <p className="mt-3 text-sm leading-relaxed text-muted">
          {selectedSource.snippet}
        </p>
      </div>
    </div>
  );
}

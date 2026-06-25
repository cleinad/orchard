"use client";

import { memo, useCallback, type MouseEvent } from 'react';
import MarkdownWithThreads from '@/app/home/components/MarkdownWithThreads';
import SearchSourcesTray from '@/app/home/components/SearchSourcesTray';
import type { BranchChip } from '@/app/home/components/conversationTree';
import type { InlineThreadMarker } from '@/app/home/components/threadTypes';
import type { Message } from '@/app/home/types';
import { markdownContentClassName } from '@/lib/markdown';
import { hasUsableSearchSources } from '@/lib/search-citations';
import type { SearchActivityEvent } from '@/lib/search/types';
import SourceFavicon from '@/app/home/components/SourceFavicon';

interface MessageRowProps {
  activeName: string;
  activeSourceId: number | null;
  branchChips: BranchChip[];
  isPendingBranchSource: boolean;
  isSourceTrayOpen: boolean;
  message: Message;
  threads: InlineThreadMarker[];
  onAssistantPointerUp: () => void;
  onCitationClick: (messageId: string, sourceId: number) => void;
  onCreateBranch: (sourceMessageId: string) => void;
  onSelectBranch: (sourceMessageId: string, branchId: string | null) => void;
  onSourcesToggle: (messageId: string, sourceId: number) => void;
  onThreadClick: (thread: InlineThreadMarker) => void;
  onTraySourceSelect: (messageId: string, sourceId: number) => void;
}

function searchActivityEventLabel(event: SearchActivityEvent) {
  switch (event.type) {
    case 'planning_started':
      return event.label;
    case 'search_decision_started':
      return event.label;
    case 'search_decision_completed':
      return event.shouldSearch
        ? `Auto search: ${event.reason}`
        : `Auto skipped search: ${event.reason}`;
    case 'search_skipped':
      return event.label;
    case 'plan_selected':
      return `Planned search for ${event.resolvedIntent}`;
    case 'prior_sources_checked':
      return event.reusedCount > 0
        ? `Checked prior sources and reused ${event.reusedCount}`
        : 'Checked prior sources';
    case 'search_started':
      return `Searched: ${event.query}`;
    case 'relevance_checked':
      return event.reason;
    case 'search_completed':
      return event.collapsedLabel;
    default: {
      const exhaustiveCheck: never = event;
      return exhaustiveCheck;
    }
  }
}

function MessageRow({
  activeName,
  activeSourceId,
  branchChips,
  isPendingBranchSource,
  isSourceTrayOpen,
  message,
  threads,
  onAssistantPointerUp,
  onCitationClick,
  onCreateBranch,
  onSelectBranch,
  onSourcesToggle,
  onThreadClick,
  onTraySourceSelect,
}: MessageRowProps) {
  const replySearchMetadata =
    message.role === 'assistant' ? message.searchMetadata ?? null : null;
  const searchActivity =
    message.role === 'assistant'
      ? message.searchActivity
        ?? (replySearchMetadata?.version === 2 ? replySearchMetadata.activity ?? null : null)
      : null;
  const searchActivityLabel = searchActivity?.collapsedLabel ?? null;
  const searchActivitySteps =
    searchActivity?.events
      .map(searchActivityEventLabel)
      .filter((label, index, labels) => label && labels.indexOf(label) === index)
    ?? [];
  const canExpandSearchActivity = searchActivitySteps.length > 1;
  const hasSources = hasUsableSearchSources(replySearchMetadata);
  const handleCitationClick = useCallback(
    (sourceId: number) => onCitationClick(message.id, sourceId),
    [message.id, onCitationClick]
  );
  const handleSourcesClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      onSourcesToggle(message.id, replySearchMetadata?.sources[0]?.id ?? 1);
    },
    [message.id, onSourcesToggle, replySearchMetadata?.sources]
  );
  const handleTraySourceSelect = useCallback(
    (sourceId: number) => onTraySourceSelect(message.id, sourceId),
    [message.id, onTraySourceSelect]
  );
  const handleFooterSourceClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>, sourceId: number) => {
      event.stopPropagation();
      onTraySourceSelect(message.id, sourceId);
    },
    [message.id, onTraySourceSelect]
  );

  return (
    <div
      className="py-4"
      data-message-id={message.id}
      data-message-role={message.role}
      onPointerUp={message.role === 'assistant' ? onAssistantPointerUp : undefined}
    >
      <div
        className={`rounded-2xl transition ${
          isPendingBranchSource
            ? 'bg-foreground/[0.03] px-3 py-3 ring-1 ring-foreground/[0.08]'
            : ''
        }`}
      >
        <div className="flex items-baseline justify-between font-sans">
          <span className="text-xs font-medium tracking-wider text-muted">
            {message.role === 'user' ? 'You' : activeName}
          </span>
          <span className="text-xs text-muted/60">
            {message.timestamp.toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>

        {searchActivityLabel && (
          <div
            className="mt-2 font-sans text-xs text-muted/70"
            onPointerUp={(event) => event.stopPropagation()}
          >
            {canExpandSearchActivity ? (
              <details className="group">
                <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-md py-0.5 text-muted/80 transition-colors hover:text-foreground">
                  <span>{searchActivityLabel}</span>
                  <span className="text-muted/45 transition group-open:rotate-90">&gt;</span>
                </summary>
                <ol className="mt-1.5 space-y-1 pl-3 text-muted/60">
                  {searchActivitySteps.map((step, index) => (
                    <li key={`${index}-${step}`} className="list-decimal pl-1">
                      {step}
                    </li>
                  ))}
                </ol>
              </details>
            ) : (
              <span>{searchActivityLabel}</span>
            )}
          </div>
        )}

        <div
          data-message-content="true"
          className={`${markdownContentClassName} mt-2 text-base leading-relaxed text-foreground`}
        >
          <MarkdownWithThreads
            content={message.content}
            threads={threads}
            onThreadClick={onThreadClick}
            searchMetadata={replySearchMetadata}
            activeCitationSourceId={activeSourceId}
            onCitationClick={hasSources ? handleCitationClick : undefined}
          />
          {message.isStreaming && (
            <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-foreground/50 align-middle" />
          )}
        </div>

        {!message.isStreaming && hasSources && replySearchMetadata && (
          <>
            <div className="mt-2 flex min-h-7 flex-wrap items-center gap-x-2 gap-y-1 font-sans text-xs text-muted">
              <button
                type="button"
                onClick={handleSourcesClick}
                onPointerUp={(event) => event.stopPropagation()}
                className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2 transition-colors ${
                  isSourceTrayOpen
                    ? 'border-foreground/15 bg-foreground/[0.04] text-foreground'
                    : 'border-transparent text-muted hover:border-border-subtle hover:bg-foreground/[0.025] hover:text-foreground'
                }`}
              >
                <span>Sources</span>
                <span className="text-current/55">{replySearchMetadata.sources.length}</span>
              </button>
              <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                {replySearchMetadata.sources.slice(0, 3).map((source) => (
                  <button
                    key={source.id}
                    type="button"
                    className="inline-flex min-w-0 max-w-[9rem] items-center gap-1.5 rounded-md px-1 py-0.5 text-muted/80 transition-colors hover:bg-foreground/[0.025] hover:text-foreground"
                    title={source.title}
                    onClick={(event) => handleFooterSourceClick(event, source.id)}
                    onPointerUp={(event) => event.stopPropagation()}
                  >
                    <SourceFavicon domain={source.domain} title={source.title} size={14} />
                    <span className="truncate">{source.domain}</span>
                  </button>
                ))}
                {replySearchMetadata.sources.length > 3 && (
                  <button
                    type="button"
                    className="rounded-md px-1 py-0.5 text-muted/60 transition-colors hover:bg-foreground/[0.025] hover:text-foreground"
                    onClick={handleSourcesClick}
                    onPointerUp={(event) => event.stopPropagation()}
                  >
                    +{replySearchMetadata.sources.length - 3}
                  </button>
                )}
              </span>
            </div>

            {isSourceTrayOpen && (
              <SearchSourcesTray
                searchMetadata={replySearchMetadata}
                activeSourceId={activeSourceId}
                onSourceSelect={handleTraySourceSelect}
              />
            )}
          </>
        )}

        {!message.isStreaming && message.role === 'assistant' && (
          <div
            className="mt-3 flex flex-wrap items-center gap-2"
            onPointerUp={(event) => event.stopPropagation()}
          >
            {branchChips.map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => onSelectBranch(message.id, chip.branchId)}
                className={`rounded-full px-3 py-1.5 font-sans text-xs font-medium transition ${
                  chip.isActive
                    ? 'bg-foreground text-background'
                    : chip.kind === 'pending'
                      ? 'border border-dashed border-foreground/[0.18] bg-surface text-foreground'
                      : 'bg-foreground/[0.05] text-muted hover:bg-foreground/[0.08] hover:text-foreground'
                }`}
              >
                {chip.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => onCreateBranch(message.id)}
              className="rounded-full border border-border-subtle bg-surface px-3 py-1.5 font-sans text-xs font-medium text-muted transition hover:border-foreground/[0.10] hover:bg-foreground/[0.03] hover:text-foreground"
            >
              + Branch
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(MessageRow);

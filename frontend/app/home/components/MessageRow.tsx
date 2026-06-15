"use client";

import { memo, useCallback, useState, type MouseEvent } from 'react';
import MarkdownWithThreads from '@/app/home/components/MarkdownWithThreads';
import SearchSourcesTray from '@/app/home/components/SearchSourcesTray';
import type { BranchChip } from '@/app/home/components/conversationTree';
import type { InlineThreadMarker } from '@/app/home/components/threadTypes';
import type { Message } from '@/app/home/types';
import type { ChatImageAttachment } from '@/lib/chat-attachments';
import { markdownContentClassName } from '@/lib/markdown';
import { hasUsableSearchSources } from '@/lib/search-citations';

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
  const [selectedImage, setSelectedImage] = useState<ChatImageAttachment | null>(null);
  const replySearchMetadata =
    message.role === 'assistant' ? message.searchMetadata ?? null : null;
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

        {message.attachments && message.attachments.length > 0 && (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {message.attachments.map((attachment) => (
              <div
                key={attachment.id}
                className="group relative overflow-hidden rounded-md bg-foreground/[0.04] ring-1 ring-border-subtle"
              >
                {attachment.url ? (
                  <button
                    type="button"
                    onClick={() => setSelectedImage(attachment)}
                    aria-label={attachment.fileName}
                    className="block w-full cursor-zoom-in"
                  >
                    <img
                      src={attachment.url}
                      alt={attachment.fileName}
                      className="aspect-video w-full object-cover"
                    />
                  </button>
                ) : (
                  <div className="aspect-video w-full bg-foreground/[0.04]" />
                )}
              </div>
            ))}
          </div>
        )}

        {!message.isStreaming && hasSources && replySearchMetadata && (
          <>
            <div className="mt-3">
              <button
                type="button"
                onClick={handleSourcesClick}
                onPointerUp={(event) => event.stopPropagation()}
                className={`inline-flex items-center rounded-full border px-3 py-1 font-sans text-xs font-medium transition-colors ${
                  isSourceTrayOpen
                    ? 'border-foreground/15 bg-foreground/[0.05] text-foreground'
                    : 'border-border-subtle text-muted hover:bg-foreground/[0.04] hover:text-foreground'
                }`}
              >
                Sources {replySearchMetadata.sources.length}
              </button>
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

      {selectedImage?.url && (
        <button
          type="button"
          className="fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center bg-background/90 p-4 backdrop-blur-sm"
          onClick={() => setSelectedImage(null)}
          aria-label="Close image preview"
        >
          <img
            src={selectedImage.url}
            alt={selectedImage.fileName}
            className="max-h-full max-w-full rounded-md object-contain shadow-2xl"
          />
        </button>
      )}
    </div>
  );
}

export default memo(MessageRow);

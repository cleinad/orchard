"use client";

import { useCallback, useEffect, useState, type RefObject } from 'react';
import MarkdownWithThreads from '@/app/home/components/MarkdownWithThreads';
import SearchSourcesTray from '@/app/home/components/SearchSourcesTray';
import type { InlineThreadMarker } from '@/app/home/components/threadTypes';
import type { Message } from '@/app/home/types';
import type { BranchChip } from '@/app/home/components/conversationTree';
import type { ChatImageAttachment } from '@/lib/chat-attachments';
import { markdownContentClassName } from '@/lib/markdown';
import { hasUsableSearchSources } from '@/lib/search-citations';

interface ConversationViewProps {
  listError: string | null;
  routeConversationError: string | null;
  messages: Message[];
  activeName: string;
  emptyTitle: string;
  emptySubtitle: string;
  isLoading: boolean;
  isRouteConversationLoading: boolean;
  threadsMap: Map<string, InlineThreadMarker[]>;
  branchChipsByMessageId: Map<string, BranchChip[]>;
  pendingBranchSourceMessageId: string | null;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  onThreadClick: (thread: InlineThreadMarker) => void;
  onSelectBranch: (sourceMessageId: string, branchId: string | null) => void;
  onCreateBranch: (sourceMessageId: string) => void;
  onAssistantPointerUp: () => void;
}

export default function ConversationView({
  listError,
  routeConversationError,
  messages,
  activeName,
  emptyTitle,
  emptySubtitle,
  isLoading,
  isRouteConversationLoading,
  threadsMap,
  branchChipsByMessageId,
  pendingBranchSourceMessageId,
  messagesEndRef,
  onThreadClick,
  onSelectBranch,
  onCreateBranch,
  onAssistantPointerUp,
}: ConversationViewProps) {
  const [openSourceTray, setOpenSourceTray] = useState<{
    messageId: string;
    sourceId: number | null;
  } | null>(null);
  const [selectedImage, setSelectedImage] = useState<ChatImageAttachment | null>(null);

  useEffect(() => {
    if (!selectedImage) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedImage(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedImage]);

  const handleCitationClick = useCallback((messageId: string, sourceId: number) => {
    setOpenSourceTray((current) => {
      if (current?.messageId === messageId && current.sourceId === sourceId) {
        return null;
      }

      return {
        messageId,
        sourceId,
      };
    });
  }, []);

  const handleSourcesToggle = useCallback((messageId: string, sourceId: number) => {
    setOpenSourceTray((current) =>
      current?.messageId === messageId
        ? null
        : {
            messageId,
            sourceId,
          }
    );
  }, []);

  const handleTraySourceSelect = useCallback((messageId: string, sourceId: number) => {
    setOpenSourceTray({
      messageId,
      sourceId,
    });
  }, []);

  return (
    <>
      <div className="mx-auto max-w-2xl px-6 pb-4">
      {listError && (
        <div className="mb-4 rounded-lg bg-surface px-4 py-2 font-sans text-xs text-muted shadow-sm">
          {listError}
        </div>
      )}

      {messages.length === 0 ? (
        <div className="flex h-full min-h-[50vh] flex-col items-center justify-center px-4">
          {isRouteConversationLoading ? (
            <div
              role="status"
              aria-label="Loading conversation"
              className="flex items-center gap-1.5 text-muted"
            >
              <span
                className="h-2 w-2 animate-bounce rounded-full bg-muted/40"
                style={{ animationDelay: '0ms' }}
              />
              <span
                className="h-2 w-2 animate-bounce rounded-full bg-muted/40"
                style={{ animationDelay: '150ms' }}
              />
              <span
                className="h-2 w-2 animate-bounce rounded-full bg-muted/40"
                style={{ animationDelay: '300ms' }}
              />
            </div>
          ) : routeConversationError ? (
            <div className="max-w-md text-center">
              <h1 className="font-heading text-3xl text-foreground sm:text-4xl">
                Could not load this conversation
              </h1>
              <p className="mt-4 font-sans text-md font-medium leading-relaxed text-muted">
                {routeConversationError}
              </p>
            </div>
          ) : (
            <div className="text-center">
              <h1 className="font-heading text-3xl text-foreground sm:text-4xl">
                {emptyTitle}
              </h1>
              <p className="mt-4 max-w-md font-sans text-md font-medium leading-relaxed text-muted">
                {emptySubtitle}
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="py-8">
          {messages.map((message) => {
            const replySearchMetadata =
              message.role === 'assistant' ? message.searchMetadata ?? null : null;
            const hasSources = hasUsableSearchSources(replySearchMetadata);
            const isSourceTrayOpen = openSourceTray?.messageId === message.id;
            const activeSourceId =
              isSourceTrayOpen
                ? openSourceTray?.sourceId ?? replySearchMetadata?.sources[0]?.id ?? null
                : null;
            const branchChips = branchChipsByMessageId.get(message.id) || [];
            const isPendingBranchSource = pendingBranchSourceMessageId === message.id;

            return (
              <div
                key={message.renderId ?? message.id}
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
                    {message.content && (
                      <MarkdownWithThreads
                        content={message.content}
                        threads={threadsMap.get(message.id) || []}
                        onThreadClick={onThreadClick}
                        searchMetadata={replySearchMetadata}
                        activeCitationSourceId={activeSourceId}
                        onCitationClick={
                          hasSources
                            ? (sourceId) => handleCitationClick(message.id, sourceId)
                            : undefined
                        }
                      />
                    )}
                    {/* Blinking cursor shown while the stream is still arriving */}
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

                  {/* Sources and branch controls are suppressed while streaming */}
                  {!message.isStreaming && hasSources && replySearchMetadata && (
                    <>
                      <div className="mt-3">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleSourcesToggle(
                              message.id,
                              replySearchMetadata.sources[0]?.id ?? 1
                            );
                          }}
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
                          onSourceSelect={(sourceId) =>
                            handleTraySourceSelect(message.id, sourceId)
                          }
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
          })}

          {/* Bouncing dots only while waiting for the first token (no streaming message yet) */}
          {isLoading && !messages.some((m) => m.isStreaming) && (
            <div className="py-4 font-sans">
              <span className="text-xs font-medium tracking-wider text-muted">
                {activeName}
              </span>
              <div className="mt-2 flex items-center gap-1.5">
                <span
                  className="h-2 w-2 animate-bounce rounded-full bg-muted/40"
                  style={{ animationDelay: '0ms' }}
                />
                <span
                  className="h-2 w-2 animate-bounce rounded-full bg-muted/40"
                  style={{ animationDelay: '150ms' }}
                />
                <span
                  className="h-2 w-2 animate-bounce rounded-full bg-muted/40"
                  style={{ animationDelay: '300ms' }}
                />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      )}
      </div>

      {selectedImage?.url && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={selectedImage.fileName}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setSelectedImage(null)}
        >
          <div
            className="relative max-h-full max-w-5xl"
            onClick={(event) => event.stopPropagation()}
          >
            <img
              src={selectedImage.url}
              alt={selectedImage.fileName}
              className="max-h-[88vh] max-w-full rounded-md object-contain shadow-2xl"
            />
            <button
              type="button"
              onClick={() => setSelectedImage(null)}
              aria-label="Close image preview"
              className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-background/90 text-muted shadow-sm transition hover:text-foreground"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  );
}

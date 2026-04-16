"use client";

import { useCallback, useState, type RefObject } from 'react';
import MarkdownWithThreads from '@/app/home/components/MarkdownWithThreads';
import SearchSourcesTray from '@/app/home/components/SearchSourcesTray';
import type { InlineThreadMarker } from '@/app/home/components/threadTypes';
import type { Message } from '@/app/home/types';
import type { BranchChip } from '@/app/home/components/conversationTree';
import { markdownContentClassName } from '@/lib/markdown';

interface ConversationViewProps {
  loadingLists: boolean;
  listError: string | null;
  messages: Message[];
  activeName: string;
  emptyTitle: string;
  emptySubtitle: string;
  isLoading: boolean;
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
  loadingLists,
  listError,
  messages,
  activeName,
  emptyTitle,
  emptySubtitle,
  isLoading,
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
    <div className="mx-auto max-w-2xl px-6 pb-4">
      {(loadingLists || listError) && (
        <div className="mb-4 rounded-lg bg-surface px-4 py-2 text-xs text-muted shadow-sm">
          {loadingLists ? 'Loading chats and mentors...' : listError}
        </div>
      )}

      {messages.length === 0 ? (
        <div className="flex h-full min-h-[50vh] flex-col items-center justify-center px-4">
          <div className="text-center">
            <h1 className="font-heading text-3xl text-foreground sm:text-4xl">
              {emptyTitle}
            </h1>
            <p className="mt-4 max-w-md text-md font-medium leading-relaxed text-muted">
              {emptySubtitle}
            </p>
          </div>
        </div>
      ) : (
        <div className="py-8">
          {messages.map((message) => {
            const replySearchMetadata =
              message.role === 'assistant' ? message.searchMetadata ?? null : null;
            const hasSources =
              replySearchMetadata?.status === 'success'
              && replySearchMetadata.sources.length > 0;
            const isSourceTrayOpen = openSourceTray?.messageId === message.id;
            const activeSourceId =
              isSourceTrayOpen
                ? openSourceTray?.sourceId ?? replySearchMetadata?.sources[0]?.id ?? null
                : null;
            const branchChips = branchChipsByMessageId.get(message.id) || [];
            const isPendingBranchSource = pendingBranchSourceMessageId === message.id;

            return (
              <div
                key={message.id}
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
                  <div className="flex items-baseline justify-between">
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
                  </div>

                  {hasSources && replySearchMetadata && (
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
                          className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
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

                  {message.role === 'assistant' && (
                    <div
                      className="mt-3 flex flex-wrap items-center gap-2"
                      onPointerUp={(event) => event.stopPropagation()}
                    >
                      {branchChips.map((chip) => (
                        <button
                          key={chip.id}
                          type="button"
                          onClick={() => onSelectBranch(message.id, chip.branchId)}
                          className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
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
                        className="rounded-full border border-border-subtle bg-surface px-3 py-1.5 text-xs font-medium text-muted transition hover:border-foreground/[0.10] hover:bg-foreground/[0.03] hover:text-foreground"
                      >
                        + Branch
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {isLoading && (
            <div className="py-4">
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
  );
}

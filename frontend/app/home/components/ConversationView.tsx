"use client";

import { useCallback, useState, type RefObject } from 'react';
import AsciiTesseract from '@/app/home/components/AsciiTesseract';
import MessageRow from '@/app/home/components/MessageRow';
import type { InlineThreadMarker, ThreadSource } from '@/app/home/components/threadTypes';
import type { Message } from '@/app/home/types';
import type { BranchChip } from '@/app/home/components/conversationTree';

interface ConversationViewProps {
  activeHighlightSource: ThreadSource | null;
  isWideLayout: boolean;
  listError: string | null;
  routeConversationError: string | null;
  messages: Message[];
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

const EMPTY_BRANCH_CHIPS: BranchChip[] = [];
const EMPTY_THREAD_MARKERS: InlineThreadMarker[] = [];

export default function ConversationView({
  activeHighlightSource,
  isWideLayout,
  listError,
  routeConversationError,
  messages,
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

  const widthClassName = isWideLayout
    ? 'w-full max-w-[88rem] px-6 sm:w-[calc(100%-3rem)] sm:px-8 lg:w-[calc(100%-5rem)] lg:px-10'
    : 'max-w-2xl px-6';

  return (
    <div className={`mx-auto pb-4 ${widthClassName}`}>
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
            <div className="flex w-full max-w-2xl flex-col items-center text-center sm:mt-[clamp(5rem,12vh,10rem)]">
              <h1 className="font-heading text-[clamp(1.65rem,2.5vw,2.25rem)] leading-[0.95] text-foreground">
                Let&apos;s explore
              </h1>
              <div className="mt-10 flex w-full justify-center sm:mt-14">
                <AsciiTesseract />
              </div>
              <p className="sr-only">{emptyTitle}. {emptySubtitle}</p>
            </div>
          )}
        </div>
      ) : (
        <div className="py-8">
          {messages.map((message) => {
            const replySearchMetadata =
              message.role === 'assistant' ? message.searchMetadata ?? null : null;
            const isSourceTrayOpen = openSourceTray?.messageId === message.id;
            const activeSourceId =
              isSourceTrayOpen
                ? openSourceTray?.sourceId ?? replySearchMetadata?.sources[0]?.id ?? null
                : null;
            const branchChips =
              branchChipsByMessageId.get(message.id) ?? EMPTY_BRANCH_CHIPS;
            const isPendingBranchSource = pendingBranchSourceMessageId === message.id;

            return (
              <MessageRow
                key={message.renderId ?? message.id}
                activeHighlightSource={activeHighlightSource}
                activeSourceId={activeSourceId}
                branchChips={branchChips}
                isPendingBranchSource={isPendingBranchSource}
                isSourceTrayOpen={isSourceTrayOpen}
                message={message}
                threads={threadsMap.get(message.id) ?? EMPTY_THREAD_MARKERS}
                onAssistantPointerUp={onAssistantPointerUp}
                onCitationClick={handleCitationClick}
                onCreateBranch={onCreateBranch}
                onSelectBranch={onSelectBranch}
                onSourcesToggle={handleSourcesToggle}
                onThreadClick={onThreadClick}
                onTraySourceSelect={handleTraySourceSelect}
              />
            );
          })}

          {/* Bouncing dots only while waiting for the first token (no streaming message yet) */}
          {isLoading && !messages.some((m) => m.isStreaming) && (
            <div
              role="status"
              aria-label="Generating response"
              className="flex items-center gap-1.5 py-4 font-sans"
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
          )}

          <div ref={messagesEndRef} />
        </div>
      )}
    </div>
  );
}

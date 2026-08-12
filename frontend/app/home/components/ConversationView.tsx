"use client";

import { useCallback, useState, type RefObject } from 'react';
import GeneratingIndicator from '@/app/home/components/GeneratingIndicator';
import MessageRow from '@/app/home/components/MessageRow';
import type { InlineThreadMarker, ThreadSource } from '@/app/home/components/threadTypes';
import type { Message } from '@/app/home/types';
import type { BranchChip } from '@/app/home/components/conversationTree';

export interface ConversationViewProps {
  activeHighlightSource: ThreadSource | null;
  isWideLayout: boolean;
  listError: string | null;
  messages: Message[];
  isLoading: boolean;
  threadsMap: Map<string, InlineThreadMarker[]>;
  branchChipsByMessageId: Map<string, BranchChip[]>;
  pendingBranchSourceMessageId: string | null;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  onThreadClick: (thread: InlineThreadMarker) => void;
  onSelectBranch: (sourceMessageId: string, branchId: string | null) => void;
  onCreateBranch: (sourceMessageId: string) => void;
  onAssistantPointerUp: () => void;
  retrying?: boolean;
  onRetry?: () => void;
}

const EMPTY_BRANCH_CHIPS: BranchChip[] = [];
const EMPTY_THREAD_MARKERS: InlineThreadMarker[] = [];

export default function ConversationView({
  activeHighlightSource,
  isWideLayout,
  listError,
  messages,
  isLoading,
  threadsMap,
  branchChipsByMessageId,
  pendingBranchSourceMessageId,
  messagesEndRef,
  onThreadClick,
  onSelectBranch,
  onCreateBranch,
  onAssistantPointerUp,
  retrying = false,
  onRetry,
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
          <span>{listError}</span>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              disabled={retrying}
              className="ml-2 font-semibold text-foreground underline underline-offset-2 disabled:opacity-50"
            >
              {retrying ? 'Retrying…' : 'Retry'}
            </button>
          )}
        </div>
      )}

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

          {/*
            Only while waiting without a streaming placeholder. Once the
            placeholder exists, MessageRow owns the waiting state so the
            indicator sits where the reply will appear.
          */}
          {isLoading && !messages.some((m) => m.isStreaming) && <GeneratingIndicator />}

          <div ref={messagesEndRef} />
      </div>
    </div>
  );
}

'use client';

import { useMemo } from 'react';
import ConversationMap from '@/app/home/components/ConversationMap';
import { buildConversationMapModel } from '@/app/home/components/conversationMapLayout';
import { recordHomePerformanceEvent } from '@/app/home/components/homePerformanceInstrumentation';
import type { ConversationMapViewState } from '@/app/home/components/useConversationMapState';
import type {
  BranchSelectionMap,
  ConversationBranch,
  Message,
} from '@/app/home/types';

interface ConversationMapSurfaceProps {
  messages: Message[];
  branches: ConversationBranch[];
  selectedBranchIds: BranchSelectionMap;
  pendingBranchSourceMessageId: string | null;
  currentMessageId: string | null;
  viewState: ConversationMapViewState;
  followModePaused: boolean;
  testId: string;
  variant: 'desktop' | 'mobile';
  onClose: () => void;
  onSelectMessage: (messageId: string) => void;
  onViewStateChange: (patch: Partial<ConversationMapViewState>) => void;
  onFollowModePausedChange: (paused: boolean) => void;
}

export default function ConversationMapSurface({
  messages,
  branches,
  selectedBranchIds,
  pendingBranchSourceMessageId,
  currentMessageId,
  viewState,
  ...conversationMapProps
}: ConversationMapSurfaceProps) {
  const model = useMemo(() => {
    recordHomePerformanceEvent('conversation-map-model-build');
    return buildConversationMapModel({
      messages,
      branches,
      selectedBranchIds,
      pendingBranchSourceMessageId,
      currentMessageId,
      zoom: viewState.zoom,
    });
  }, [
    branches,
    currentMessageId,
    messages,
    pendingBranchSourceMessageId,
    selectedBranchIds,
    viewState.zoom,
  ]);

  return (
    <ConversationMap
      {...conversationMapProps}
      model={model}
      currentMessageId={currentMessageId}
      viewState={viewState}
    />
  );
}

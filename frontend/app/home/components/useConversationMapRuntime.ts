"use client";

import {
  useCallback,
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  type SetStateAction,
} from 'react';
import {
  getMapNavigationAnchorMessageId,
  getRouteSelectionPatch,
} from '@/app/home/components/conversationMapModel';
import {
  createPendingBranchTarget,
  type PendingBranchTarget,
} from '@/app/home/components/conversationTree';
import type {
  PersistentDraftChat,
  SelectedChat,
  TemporaryChatSession,
} from '@/app/home/components/HomeDataContext';
import type {
  BranchSelectionMap,
  ConversationBranch,
  Message,
} from '@/app/home/types';

interface UseConversationMapRuntimeParams {
  activeConversationBranches: ConversationBranch[];
  activeConversationMessages: Message[];
  clampSplitRatio: (next: number) => number;
  closeThreadPanel: () => void;
  conversationMapOpen: boolean;
  dismissPopover: () => void;
  isDesktopViewport: boolean;
  jumpToMessage: (messageId: string) => void;
  pendingBranch: PendingBranchTarget | null;
  popoverState: unknown;
  selectedChat: SelectedChat | null;
  setConversationMapOpen: (open: boolean) => void;
  setPendingBranch: (next: PendingBranchTarget | null) => void;
  setPersistentSelectedBranchIds: Dispatch<SetStateAction<BranchSelectionMap>>;
  setUserHasScrolledState: (nextValue: boolean) => void;
  splitPaneRef: RefObject<HTMLDivElement | null>;
  threadPanelOpen: boolean;
  toggleConversationMapOpen: () => void;
  updateConversationMapViewState: (patch: Partial<{ splitRatio: number }>) => void;
  updateDraftChat: (id: string, updater: (draft: PersistentDraftChat) => PersistentDraftChat) => void;
  updateTemporaryChat: (
    id: string,
    updater: (chat: TemporaryChatSession) => TemporaryChatSession
  ) => void;
}

export function useConversationMapRuntime({
  activeConversationBranches,
  activeConversationMessages,
  clampSplitRatio,
  closeThreadPanel,
  conversationMapOpen,
  dismissPopover,
  isDesktopViewport,
  jumpToMessage,
  pendingBranch,
  popoverState,
  selectedChat,
  setConversationMapOpen,
  setPendingBranch,
  setPersistentSelectedBranchIds,
  setUserHasScrolledState,
  splitPaneRef,
  threadPanelOpen,
  toggleConversationMapOpen,
  updateConversationMapViewState,
  updateDraftChat,
  updateTemporaryChat,
}: UseConversationMapRuntimeParams) {
  const updateDraftBranchSelection = useCallback(
    (draftId: string, nextSelections: BranchSelectionMap) => {
      updateDraftChat(draftId, (draft) => ({
        ...draft,
        selectedBranchIds: {
          ...draft.selectedBranchIds,
          ...nextSelections,
        },
      }));
    },
    [updateDraftChat]
  );

  const updateActiveBranchSelections = useCallback(
    (nextSelections: BranchSelectionMap) => {
      if (selectedChat?.kind === 'temporary') {
        updateTemporaryChat(selectedChat.tempChatId, (chat) => ({
          ...chat,
          selectedBranchIds: {
            ...chat.selectedBranchIds,
            ...nextSelections,
          },
        }));
        return;
      }

      if (selectedChat?.kind === 'draft') {
        updateDraftBranchSelection(selectedChat.draftId, nextSelections);
        return;
      }

      if (selectedChat?.kind === 'persistent') {
        setPersistentSelectedBranchIds((prev) => ({
          ...prev,
          ...nextSelections,
        }));
      }
    },
    [selectedChat, setPersistentSelectedBranchIds, updateDraftBranchSelection, updateTemporaryChat]
  );

  const updateActiveBranchSelection = useCallback(
    (sourceMessageId: string, branchId: string) => {
      updateActiveBranchSelections({
        [sourceMessageId]: branchId,
      });
    },
    [updateActiveBranchSelections]
  );

  const handleCreateBranch = useCallback((sourceMessageId: string) => {
    setPendingBranch(createPendingBranchTarget(sourceMessageId));
    setUserHasScrolledState(false);
  }, [setPendingBranch, setUserHasScrolledState]);

  const handleSelectBranch = useCallback(
    (sourceMessageId: string, branchId: string | null) => {
      if (branchId) {
        updateActiveBranchSelection(sourceMessageId, branchId);
      }

      if (pendingBranch?.sourceMessageId === sourceMessageId) {
        setPendingBranch(null);
      }

      setUserHasScrolledState(false);
    },
    [pendingBranch, setPendingBranch, setUserHasScrolledState, updateActiveBranchSelection]
  );

  const handleSelectMessageFromMap = useCallback(
    (messageId: string) => {
      const routeSelections = getRouteSelectionPatch({
        messages: activeConversationMessages,
        branches: activeConversationBranches,
        targetMessageId: messageId,
      });

      if (Object.keys(routeSelections).length > 0) {
        updateActiveBranchSelections(routeSelections);
      }

      setPendingBranch(null);
      jumpToMessage(
        getMapNavigationAnchorMessageId({
          messages: activeConversationMessages,
          targetMessageId: messageId,
        }) ?? messageId
      );

      if (!isDesktopViewport) {
        setConversationMapOpen(false);
      }
    },
    [
      activeConversationBranches,
      activeConversationMessages,
      isDesktopViewport,
      jumpToMessage,
      setConversationMapOpen,
      setPendingBranch,
      updateActiveBranchSelections,
    ]
  );

  const handleToggleConversationMap = useCallback(() => {
    if (!conversationMapOpen) {
      if (threadPanelOpen) {
        closeThreadPanel();
      }

      if (popoverState) {
        dismissPopover();
      }
    }

    toggleConversationMapOpen();
  }, [
    closeThreadPanel,
    conversationMapOpen,
    dismissPopover,
    popoverState,
    threadPanelOpen,
    toggleConversationMapOpen,
  ]);

  const handleStartMapResize = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const container = splitPaneRef.current;
      if (!container) {
        return;
      }

      const rect = container.getBoundingClientRect();

      const handlePointerMove = (moveEvent: globalThis.PointerEvent) => {
        const nextMapRatio = clampSplitRatio((rect.right - moveEvent.clientX) / rect.width);
        updateConversationMapViewState({
          splitRatio: nextMapRatio,
        });
      };

      const handlePointerUp = () => {
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
      };

      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
      event.preventDefault();
    },
    [clampSplitRatio, splitPaneRef, updateConversationMapViewState]
  );

  return {
    handleCreateBranch,
    handleSelectBranch,
    handleSelectMessageFromMap,
    handleStartMapResize,
    handleToggleConversationMap,
    updateActiveBranchSelections,
  };
}

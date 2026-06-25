"use client";

import { useCallback, useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type {
  PersistentDraftChat,
  SelectedChat,
} from '@/app/home/components/HomeDataContext';
import type { ThreadMeta } from '@/app/home/components/threadTypes';
import type {
  BranchSelectionMap,
  ConversationBranch,
  Message,
} from '@/app/home/types';
import { getComposerStateKey } from '@/app/home/components/homeSelection';
import type { PendingBranchTarget } from '@/app/home/components/conversationTree';

interface UseHomeChatSwitchLifecycleParams {
  clearComposerInputForSelection: (selection: SelectedChat | null) => void;
  clearPendingChatRequestForSelection: (selection: SelectedChat) => void;
  clearResponseStyleForSelection: (selection: SelectedChat | null) => void;
  clearSearchStateForSelection: (selection: SelectedChat | null) => void;
  composerDraftInputsRef: MutableRefObject<Record<string, string>>;
  endProgrammaticTranscriptNavigation: () => void;
  registerCloseTempChatCleanup: (fn: (tempChatId: string) => void) => void;
  registerPrepareForChatSwitch: (fn: (next: SelectedChat | null) => void) => void;
  resetThreadUi: () => void;
  scrollInstantRef: MutableRefObject<boolean>;
  selectedChatRef: MutableRefObject<SelectedChat | null>;
  selectedDraftChat: PersistentDraftChat | null;
  selectedDraftChatRef: MutableRefObject<PersistentDraftChat | null>;
  setConversationMapOpen: (open: boolean) => void;
  setDraftChats: Dispatch<SetStateAction<PersistentDraftChat[]>>;
  setPendingBranch: Dispatch<SetStateAction<PendingBranchTarget | null>>;
  setPersistentBranches: Dispatch<SetStateAction<ConversationBranch[]>>;
  setPersistentMessages: Dispatch<SetStateAction<Message[]>>;
  setPersistentSelectedBranchIds: Dispatch<SetStateAction<BranchSelectionMap>>;
  setPersistentThreadsMap: Dispatch<SetStateAction<Map<string, ThreadMeta[]>>>;
  setUserHasScrolledState: (nextValue: boolean) => void;
  stopMic: () => void;
  tts: { stop: () => void };
}

export function useHomeChatSwitchLifecycle({
  clearComposerInputForSelection,
  clearPendingChatRequestForSelection,
  clearResponseStyleForSelection,
  clearSearchStateForSelection,
  composerDraftInputsRef,
  endProgrammaticTranscriptNavigation,
  registerCloseTempChatCleanup,
  registerPrepareForChatSwitch,
  resetThreadUi,
  scrollInstantRef,
  selectedChatRef,
  selectedDraftChat,
  selectedDraftChatRef,
  setConversationMapOpen,
  setDraftChats,
  setPendingBranch,
  setPersistentBranches,
  setPersistentMessages,
  setPersistentSelectedBranchIds,
  setPersistentThreadsMap,
  setUserHasScrolledState,
  stopMic,
  tts,
}: UseHomeChatSwitchLifecycleParams) {
  useEffect(() => {
    selectedDraftChatRef.current = selectedDraftChat;
  }, [selectedDraftChat, selectedDraftChatRef]);

  const prepareForChatSwitch = useCallback(
    (nextSelection: SelectedChat | null) => {
      tts.stop();
      stopMic();
      resetThreadUi();
      setPendingBranch(null);
      setConversationMapOpen(false);
      endProgrammaticTranscriptNavigation();
      setUserHasScrolledState(false);
      scrollInstantRef.current = true;

      const currentSelection = selectedChatRef.current;
      const currentDraft = selectedDraftChatRef.current;
      const currentInput = currentSelection
        ? composerDraftInputsRef.current[getComposerStateKey(currentSelection)] ?? ''
        : '';

      const shouldClearPersistentConversationState =
        nextSelection === null || nextSelection.kind === 'persistent';

      if (shouldClearPersistentConversationState) {
        setPersistentMessages([]);
        setPersistentBranches([]);
        setPersistentSelectedBranchIds({});
        setPersistentThreadsMap(new Map());
      }

      if (
        currentSelection?.kind === 'draft' &&
        currentDraft &&
        currentDraft.messages.length === 0 &&
        currentInput.length === 0 &&
        !(
          nextSelection?.kind === 'draft' &&
          nextSelection.draftId === currentDraft.id
        )
      ) {
        setDraftChats((prev) =>
          prev.filter((draft) => draft.id !== currentDraft.id)
        );
        clearComposerInputForSelection(currentSelection);
        clearResponseStyleForSelection(currentSelection);
        clearSearchStateForSelection(currentSelection);
        clearPendingChatRequestForSelection(currentSelection);
      }
    },
    [
      clearComposerInputForSelection,
      clearPendingChatRequestForSelection,
      clearResponseStyleForSelection,
      clearSearchStateForSelection,
      composerDraftInputsRef,
      endProgrammaticTranscriptNavigation,
      resetThreadUi,
      scrollInstantRef,
      selectedChatRef,
      selectedDraftChatRef,
      setConversationMapOpen,
      setDraftChats,
      setPendingBranch,
      setPersistentBranches,
      setPersistentMessages,
      setPersistentSelectedBranchIds,
      setPersistentThreadsMap,
      setUserHasScrolledState,
      stopMic,
      tts,
    ]
  );

  useEffect(() => {
    registerPrepareForChatSwitch(prepareForChatSwitch);
  }, [prepareForChatSwitch, registerPrepareForChatSwitch]);

  useEffect(() => {
    registerCloseTempChatCleanup((tempChatId: string) => {
      const closedSelection: SelectedChat = { kind: 'temporary', tempChatId };
      clearComposerInputForSelection(closedSelection);
      clearResponseStyleForSelection(closedSelection);
      clearSearchStateForSelection(closedSelection);
      clearPendingChatRequestForSelection(closedSelection);
    });
  }, [
    clearComposerInputForSelection,
    clearPendingChatRequestForSelection,
    clearResponseStyleForSelection,
    clearSearchStateForSelection,
    registerCloseTempChatCleanup,
  ]);
}

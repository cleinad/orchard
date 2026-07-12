"use client";

import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import type { HomeE2eFixture } from '@/app/home/e2eFixtures';
import type {
  PersistentDraftChat,
  SelectedChat,
  TemporaryChatSession,
} from '@/app/home/components/HomeDataContext';
import type { PendingBranchTarget } from '@/app/home/components/conversationTree';
import type { ThreadMeta } from '@/app/home/components/threadTypes';
import type { ThreadMetaRecord } from '@/app/home/components/persistentThreadRuntime';
import type { PersistentConversationTranscriptInput } from '@/app/home/components/persistentConversationCache';
import {
  DEFAULT_TEMPORARY_MEMORY_MODE,
} from '@/lib/chat-session';

function buildFixtureThreadsMap(threads: ThreadMeta[]) {
  const next = new Map<string, ThreadMeta[]>();

  for (const thread of threads) {
    const existing = next.get(thread.sourceMessageId) || [];
    existing.push(thread);
    next.set(thread.sourceMessageId, existing);
  }

  return next;
}

interface UseHomeFixtureRuntimeParams {
  composerDraftInputsStorageKey: string;
  endProgrammaticTranscriptNavigation: () => void;
  fixture: HomeE2eFixture | null;
  resetAllComposerState: () => void;
  resetPendingRequests: () => void;
  resetThreadUi: () => void;
  clearPersistentConversationCache: () => void;
  setDraftChats: Dispatch<SetStateAction<PersistentDraftChat[]>>;
  setListError: (error: string | null) => void;
  setPendingBranch: Dispatch<SetStateAction<PendingBranchTarget | null>>;
  setPersistentConversationTranscript: (
    conversationId: string,
    transcript: PersistentConversationTranscriptInput
  ) => void;
  setSelectedChat: Dispatch<SetStateAction<SelectedChat | null>>;
  setTemporaryChats: Dispatch<SetStateAction<TemporaryChatSession[]>>;
  setUserHasScrolledState: (nextValue: boolean) => void;
  tempChatTitle: string;
}

export function useHomeFixtureRuntime({
  composerDraftInputsStorageKey,
  endProgrammaticTranscriptNavigation,
  fixture,
  resetAllComposerState,
  resetPendingRequests,
  resetThreadUi,
  clearPersistentConversationCache,
  setDraftChats,
  setListError,
  setPendingBranch,
  setPersistentConversationTranscript,
  setSelectedChat,
  setTemporaryChats,
  setUserHasScrolledState,
  tempChatTitle,
}: UseHomeFixtureRuntimeParams) {
  const appliedHomeE2eFixtureRef = useRef<string | null>(null);

  useEffect(() => {
    if (!fixture || appliedHomeE2eFixtureRef.current === fixture.key) {
      return;
    }

    appliedHomeE2eFixtureRef.current = fixture.key;
    resetThreadUi();
    setPendingBranch(null);
    window.sessionStorage.removeItem(composerDraftInputsStorageKey);
    resetAllComposerState();
    resetPendingRequests();
    endProgrammaticTranscriptNavigation();
    setUserHasScrolledState(false);
    setListError(null);
    setDraftChats([]);

    if (fixture.chatMode === 'temporary') {
      const fixtureThreads = buildFixtureThreadsMap(fixture.threads || []);
      const fixtureChatId = `fixture-temp-${fixture.key}`;
      const now = new Date().toISOString();

      clearPersistentConversationCache();
      setTemporaryChats([
        {
          id: fixtureChatId,
          title: tempChatTitle,
          memoryMode: DEFAULT_TEMPORARY_MEMORY_MODE,
          createdAt: now,
          updatedAt: now,
          messages: fixture.messages,
          branches: fixture.branches || [],
          selectedBranchIds: fixture.selectedBranchIds || {},
          threadsMap: Object.fromEntries(fixtureThreads.entries()) as ThreadMetaRecord,
          threadMessages: {},
          threadStatuses: {},
        },
      ]);
      setSelectedChat({
        kind: 'temporary',
        tempChatId: fixtureChatId,
      });
      return;
    }

    setTemporaryChats([]);
    const conversationId = fixture.conversationId ?? `fixture-${fixture.key}`;
    setPersistentConversationTranscript(conversationId, {
      messages: fixture.messages,
      branches: fixture.branches || [],
      selectedBranchIds: fixture.selectedBranchIds || {},
      threadsMap: buildFixtureThreadsMap(fixture.threads || []),
    });
    setSelectedChat({
      kind: 'persistent',
      conversationId,
      mentorId: null,
      workspaceId: null,
    });
  }, [
    composerDraftInputsStorageKey,
    endProgrammaticTranscriptNavigation,
    fixture,
    resetAllComposerState,
    resetPendingRequests,
    resetThreadUi,
    clearPersistentConversationCache,
    setDraftChats,
    setListError,
    setPendingBranch,
    setPersistentConversationTranscript,
    setSelectedChat,
    setTemporaryChats,
    setUserHasScrolledState,
    tempChatTitle,
  ]);
}

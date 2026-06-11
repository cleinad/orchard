"use client";

import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import type { SelectedChat } from '@/app/home/components/HomeDataContext';
import type { ThreadMeta } from '@/app/home/components/threadTypes';
import type {
  BranchSelectionMap,
  ConversationBranch,
  ConversationListItem,
  Message,
} from '@/app/home/types';

interface LoadedConversationMessages {
  messages: Message[];
  branches: ConversationBranch[];
  selectedBranchIds: BranchSelectionMap;
  threadsMap: Map<string, ThreadMeta[]>;
}

interface UseRouteConversationHydrationParams {
  activeMessagesLength: number;
  effectiveRouteConversationId: string | null;
  isHomeE2eFixture: boolean;
  listError: string | null;
  loadConversationById: (id: string) => Promise<ConversationListItem>;
  loadConversationMessages: (id: string) => Promise<LoadedConversationMessages>;
  persistentMessagesLength: number;
  selectedChat: SelectedChat | null;
  selectedChatRef: MutableRefObject<SelectedChat | null>;
  invokePrepareForChatSwitch: (next: SelectedChat | null) => void;
  setListError: (error: string | null) => void;
  setPersistentBranches: Dispatch<SetStateAction<ConversationBranch[]>>;
  setPersistentMessages: Dispatch<SetStateAction<Message[]>>;
  setPersistentSelectedBranchIds: Dispatch<SetStateAction<BranchSelectionMap>>;
  setPersistentThreadsMap: Dispatch<SetStateAction<Map<string, ThreadMeta[]>>>;
  setSelectedChat: Dispatch<SetStateAction<SelectedChat | null>>;
}

export function useRouteConversationHydration({
  activeMessagesLength,
  effectiveRouteConversationId,
  isHomeE2eFixture,
  listError,
  loadConversationById,
  loadConversationMessages,
  persistentMessagesLength,
  selectedChat,
  selectedChatRef,
  invokePrepareForChatSwitch,
  setListError,
  setPersistentBranches,
  setPersistentMessages,
  setPersistentSelectedBranchIds,
  setPersistentThreadsMap,
  setSelectedChat,
}: UseRouteConversationHydrationParams) {
  const [isRouteConversationLoading, setIsRouteConversationLoading] = useState(false);
  const [routeConversationError, setRouteConversationError] = useState<string | null>(null);
  const [hydratedRouteConversationId, setHydratedRouteConversationId] = useState<string | null>(null);
  const hydratedRouteConversationIdRef = useRef<string | null>(null);
  const routeLoadRequestIdRef = useRef(0);

  useEffect(() => {
    if (isHomeE2eFixture) {
      setIsRouteConversationLoading(false);
      setRouteConversationError(null);
      return;
    }

    const currentSelectedChat = selectedChatRef.current;
    const currentPersistentSelection =
      currentSelectedChat?.kind === 'persistent' ? currentSelectedChat : null;

    if (!effectiveRouteConversationId) {
      routeLoadRequestIdRef.current += 1;
      hydratedRouteConversationIdRef.current = null;
      setHydratedRouteConversationId(null);
      setIsRouteConversationLoading(false);
      setRouteConversationError(null);

      if (currentPersistentSelection) {
        invokePrepareForChatSwitch(null);
        selectedChatRef.current = null;
        setSelectedChat(null);
        setPersistentMessages([]);
        setPersistentThreadsMap(new Map());
      }

      return;
    }

    const alreadyHydrated =
      currentPersistentSelection?.conversationId === effectiveRouteConversationId
      && (
        hydratedRouteConversationIdRef.current === effectiveRouteConversationId
        || persistentMessagesLength > 0
      );

    if (alreadyHydrated) {
      setIsRouteConversationLoading(false);
      setRouteConversationError(null);
      return;
    }

    const requestId = routeLoadRequestIdRef.current + 1;
    routeLoadRequestIdRef.current = requestId;
    setIsRouteConversationLoading(true);
    setRouteConversationError(null);

    const loadSelectedConversation = async () => {
      const loadedConversation = await loadConversationById(effectiveRouteConversationId);

      if (routeLoadRequestIdRef.current !== requestId) {
        return;
      }

      const nextSelection: SelectedChat = {
        kind: 'persistent',
        conversationId: effectiveRouteConversationId,
        mentorId: loadedConversation.mentor_id,
      };
      const shouldPreserveCurrentTranscript =
        currentPersistentSelection?.conversationId === effectiveRouteConversationId;

      invokePrepareForChatSwitch(nextSelection);
      setSelectedChat(nextSelection);
      if (!shouldPreserveCurrentTranscript) {
        setPersistentMessages([]);
        setPersistentBranches([]);
        setPersistentSelectedBranchIds({});
        setPersistentThreadsMap(new Map());
      }
      setListError(null);

      const loadedConversationData = await loadConversationMessages(effectiveRouteConversationId);

      if (routeLoadRequestIdRef.current !== requestId) {
        return;
      }

      hydratedRouteConversationIdRef.current = effectiveRouteConversationId;
      setHydratedRouteConversationId(effectiveRouteConversationId);
      setPersistentMessages(loadedConversationData.messages);
      setPersistentBranches(loadedConversationData.branches);
      setPersistentSelectedBranchIds(loadedConversationData.selectedBranchIds);
      setPersistentThreadsMap(loadedConversationData.threadsMap);
      setIsRouteConversationLoading(false);
      setRouteConversationError(null);
    };

    void loadSelectedConversation().catch((err) => {
      if (routeLoadRequestIdRef.current !== requestId) {
        return;
      }

      hydratedRouteConversationIdRef.current = null;
      setHydratedRouteConversationId(null);
      invokePrepareForChatSwitch({
        kind: 'persistent',
        conversationId: effectiveRouteConversationId,
        mentorId: null,
      });
      setListError(err instanceof Error ? err.message : 'Failed to load conversation');
      setSelectedChat({
        kind: 'persistent',
        conversationId: effectiveRouteConversationId,
        mentorId: null,
      });
      setIsRouteConversationLoading(false);
      setRouteConversationError(
        err instanceof Error ? err.message : 'Failed to load conversation'
      );
      if (currentPersistentSelection?.conversationId !== effectiveRouteConversationId) {
        setPersistentMessages([]);
        setPersistentThreadsMap(new Map());
      }
    });
  }, [
    effectiveRouteConversationId,
    invokePrepareForChatSwitch,
    isHomeE2eFixture,
    loadConversationById,
    loadConversationMessages,
    persistentMessagesLength,
    selectedChatRef,
    setListError,
    setPersistentBranches,
    setPersistentMessages,
    setPersistentSelectedBranchIds,
    setPersistentThreadsMap,
    setSelectedChat,
  ]);

  const shouldShowRouteConversationLoading =
    effectiveRouteConversationId !== null
    && activeMessagesLength === 0
    && listError === null
    && hydratedRouteConversationId !== effectiveRouteConversationId
    && (
      isRouteConversationLoading
      || selectedChat === null
      || (
        selectedChat.kind === 'persistent'
        && selectedChat.conversationId === effectiveRouteConversationId
      )
    );
  const shouldShowRouteConversationError =
    effectiveRouteConversationId !== null
    && activeMessagesLength === 0
    && routeConversationError !== null;

  return {
    hydratedRouteConversationIdRef,
    isRouteConversationLoading,
    routeConversationError,
    shouldShowRouteConversationError,
    shouldShowRouteConversationLoading,
  };
}

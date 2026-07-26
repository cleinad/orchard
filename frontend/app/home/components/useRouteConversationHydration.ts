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
import type {
  PersistentConversationTranscript,
} from '@/app/home/components/persistentConversationCache';

interface LoadedConversationMessages {
  messages: Message[];
  branches: ConversationBranch[];
  selectedBranchIds: BranchSelectionMap;
  threadsMap: Map<string, ThreadMeta[]>;
}

interface UseRouteConversationHydrationParams {
  activeMessagesLength: number;
  conversations: ConversationListItem[];
  effectiveRouteConversationId: string | null;
  getPersistentConversationTranscript: (
    conversationId: string
  ) => PersistentConversationTranscript | null;
  hasRouteConversationTranscript: boolean;
  isHomeE2eFixture: boolean;
  listError: string | null;
  loadConversationById: (id: string) => Promise<ConversationListItem>;
  loadConversationMessages: (id: string) => Promise<LoadedConversationMessages>;
  loadPersistentConversationTranscript: (
    conversationId: string,
    loader: () => Promise<LoadedConversationMessages>
  ) => Promise<PersistentConversationTranscript>;
  selectedChat: SelectedChat | null;
  selectedChatRef: MutableRefObject<SelectedChat | null>;
  invokePrepareForChatSwitch: (next: SelectedChat | null) => void;
  setListError: (error: string | null) => void;
  setSelectedChat: Dispatch<SetStateAction<SelectedChat | null>>;
}

export function useRouteConversationHydration({
  activeMessagesLength,
  conversations,
  effectiveRouteConversationId,
  getPersistentConversationTranscript,
  hasRouteConversationTranscript,
  isHomeE2eFixture,
  listError,
  loadConversationById,
  loadConversationMessages,
  loadPersistentConversationTranscript,
  selectedChat,
  selectedChatRef,
  invokePrepareForChatSwitch,
  setListError,
  setSelectedChat,
}: UseRouteConversationHydrationParams) {
  const [isRouteConversationLoading, setIsRouteConversationLoading] = useState(false);
  const [routeConversationError, setRouteConversationError] = useState<string | null>(null);
  const [hydratedRouteConversationId, setHydratedRouteConversationId] = useState<string | null>(null);
  const hydratedRouteConversationIdRef = useRef<string | null>(null);
  const routeLoadRequestIdRef = useRef(0);
  const routeLoadConversationIdRef = useRef<string | null>(null);
  const routeConversationMissingRef = useRef(false);
  const activeRouteConversationIdRef = useRef(effectiveRouteConversationId);

  if (activeRouteConversationIdRef.current !== effectiveRouteConversationId) {
    activeRouteConversationIdRef.current = effectiveRouteConversationId;
    routeLoadRequestIdRef.current += 1;
    routeLoadConversationIdRef.current = null;
    routeConversationMissingRef.current = false;
  }

  useEffect(() => () => {
    routeLoadRequestIdRef.current += 1;
    routeLoadConversationIdRef.current = null;
  }, []);

  useEffect(() => {
    if (isHomeE2eFixture) {
      routeLoadConversationIdRef.current = null;
      setIsRouteConversationLoading(false);
      setRouteConversationError(null);
      return;
    }

    const currentSelectedChat = selectedChatRef.current;
    const currentPersistentSelection =
      currentSelectedChat?.kind === 'persistent' ? currentSelectedChat : null;

    if (!effectiveRouteConversationId) {
      routeLoadRequestIdRef.current += 1;
      routeLoadConversationIdRef.current = null;
      hydratedRouteConversationIdRef.current = null;
      routeConversationMissingRef.current = false;
      setHydratedRouteConversationId(null);
      setIsRouteConversationLoading(false);
      setRouteConversationError(null);

      if (currentPersistentSelection) {
        invokePrepareForChatSwitch(null);
        selectedChatRef.current = null;
        setSelectedChat(null);
      }

      return;
    }

    if (
      routeConversationError !== null
      && currentPersistentSelection?.conversationId === effectiveRouteConversationId
      && hydratedRouteConversationIdRef.current !== effectiveRouteConversationId
    ) {
      const missingConversationNowExists =
        routeConversationMissingRef.current
        && conversations.some((entry) => entry.id === effectiveRouteConversationId);
      if (!missingConversationNowExists) {
        routeLoadConversationIdRef.current = null;
        setIsRouteConversationLoading(false);
        return;
      }
      routeConversationMissingRef.current = false;
    }

    const alreadyHydrated =
      currentPersistentSelection?.conversationId === effectiveRouteConversationId
      && (
        hydratedRouteConversationIdRef.current === effectiveRouteConversationId
        || getPersistentConversationTranscript(effectiveRouteConversationId) !== null
      );

    if (alreadyHydrated) {
      routeLoadConversationIdRef.current = null;
      hydratedRouteConversationIdRef.current = effectiveRouteConversationId;
      routeConversationMissingRef.current = false;
      setHydratedRouteConversationId(effectiveRouteConversationId);
      setIsRouteConversationLoading(false);
      setRouteConversationError(null);
      return;
    }

    if (routeLoadConversationIdRef.current === effectiveRouteConversationId) {
      setIsRouteConversationLoading(true);
      setRouteConversationError(null);
      return;
    }

    const requestId = routeLoadRequestIdRef.current + 1;
    routeLoadRequestIdRef.current = requestId;
    routeLoadConversationIdRef.current = effectiveRouteConversationId;
    setIsRouteConversationLoading(true);
    setRouteConversationError(null);

    const loadSelectedConversation = async () => {
      const isCurrentRequest = () =>
        routeLoadRequestIdRef.current === requestId
        && activeRouteConversationIdRef.current === effectiveRouteConversationId;
      let nextSelection = currentPersistentSelection;

      if (nextSelection?.conversationId !== effectiveRouteConversationId) {
        const sidebarConversation =
          conversations.find((entry) => entry.id === effectiveRouteConversationId) ?? null;
        const loadedConversation =
          sidebarConversation ?? await loadConversationById(effectiveRouteConversationId);

        if (!isCurrentRequest()) {
          return;
        }

        nextSelection = {
          kind: 'persistent',
          conversationId: effectiveRouteConversationId,
          mentorId: loadedConversation.mentor_id,
          workspaceId: loadedConversation.workspace_id,
        };

        invokePrepareForChatSwitch(nextSelection);
        selectedChatRef.current = nextSelection;
        setSelectedChat(nextSelection);
      }
      setListError(null);

      if (getPersistentConversationTranscript(effectiveRouteConversationId)) {
        routeLoadConversationIdRef.current = null;
        hydratedRouteConversationIdRef.current = effectiveRouteConversationId;
        routeConversationMissingRef.current = false;
        setHydratedRouteConversationId(effectiveRouteConversationId);
        setIsRouteConversationLoading(false);
        setRouteConversationError(null);
        return;
      }

      await loadPersistentConversationTranscript(
        effectiveRouteConversationId,
        () => loadConversationMessages(effectiveRouteConversationId)
      );

      if (!isCurrentRequest()) {
        return;
      }

      hydratedRouteConversationIdRef.current = effectiveRouteConversationId;
      routeConversationMissingRef.current = false;
      routeLoadConversationIdRef.current = null;
      setHydratedRouteConversationId(effectiveRouteConversationId);
      setIsRouteConversationLoading(false);
      setRouteConversationError(null);
    };

    void loadSelectedConversation().catch((err) => {
      if (
        routeLoadRequestIdRef.current !== requestId
        || activeRouteConversationIdRef.current !== effectiveRouteConversationId
      ) {
        return;
      }

      hydratedRouteConversationIdRef.current = null;
      const errorMessage = err instanceof Error ? err.message : 'Failed to load conversation';
      routeConversationMissingRef.current = /conversation not found/i.test(errorMessage);
      routeLoadConversationIdRef.current = null;
      setHydratedRouteConversationId(null);
      invokePrepareForChatSwitch({
        kind: 'persistent',
        conversationId: effectiveRouteConversationId,
        mentorId: null,
        workspaceId: null,
      });
      setListError(errorMessage);
      const fallbackSelection: SelectedChat = {
        kind: 'persistent',
        conversationId: effectiveRouteConversationId,
        mentorId: null,
        workspaceId: null,
      };
      selectedChatRef.current = fallbackSelection;
      setSelectedChat(fallbackSelection);
      setIsRouteConversationLoading(false);
      setRouteConversationError(errorMessage);
    });
  }, [
    conversations,
    effectiveRouteConversationId,
    getPersistentConversationTranscript,
    invokePrepareForChatSwitch,
    isHomeE2eFixture,
    loadConversationById,
    loadConversationMessages,
    loadPersistentConversationTranscript,
    routeConversationError,
    selectedChatRef,
    setListError,
    setSelectedChat,
  ]);

  const shouldShowRouteConversationLoading =
    effectiveRouteConversationId !== null
    && activeMessagesLength === 0
    && !hasRouteConversationTranscript
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
    hydratedRouteConversationId,
    hydratedRouteConversationIdRef,
    isRouteConversationLoading,
    routeConversationError,
    shouldShowRouteConversationError,
    shouldShowRouteConversationLoading,
  };
}

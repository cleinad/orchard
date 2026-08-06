"use client";

import { useMemo, useRef } from 'react';
import {
  buildConversationMapModel,
  type ConversationMapModel,
} from '@/app/home/components/conversationMapModel';
import {
  getActivePathMessages,
  getBranchChipsForMessage,
  type PendingBranchTarget,
} from '@/app/home/components/conversationTree';
import type {
  PersistentDraftChat,
  SelectedChat,
  TemporaryChatSession,
} from '@/app/home/components/HomeDataContext';
import {
  buildInlineThreadMarkersMap,
  createEmptyPersistentThreadRuntime,
  mergeThreadsMaps,
  recordToThreadsMap,
  type PersistentThreadRuntimeRecord,
} from '@/app/home/components/persistentThreadRuntime';
import type { ThreadMeta, ThreadSession } from '@/app/home/components/threadTypes';
import type {
  BranchSelectionMap,
  ConversationBranch,
  ConversationListItem,
  Message,
} from '@/app/home/types';
import type { MentorListItem } from '@/lib/mentors/types';
import { recordHomePerformanceEvent } from '@/app/home/components/homePerformanceInstrumentation';

const EMPTY_MESSAGES: Message[] = [];
const EMPTY_BRANCHES: ConversationBranch[] = [];
const EMPTY_SELECTED_BRANCH_IDS: BranchSelectionMap = {};
const EMPTY_CONVERSATION_MAP_MODEL: ConversationMapModel = {
  rootIds: [],
  nodes: [],
  edges: [],
  nodeById: new Map(),
  nodeIdByMessageId: new Map(),
  activePathNodeIds: new Set(),
  branchPointIds: new Set(),
  collapsedSegments: [],
};

interface UseActiveConversationModelParams {
  activePendingRequest: { phase: 'awaiting-response' | 'reconciling'; userMessageId: string } | null;
  conversationMapEnabled: boolean;
  conversationMapViewState: { zoom: number };
  conversations: ConversationListItem[];
  currentMapMessageId: string | null;
  draftChats: PersistentDraftChat[];
  mentors: MentorListItem[];
  pendingBranch: PendingBranchTarget | null;
  persistentBranches: ConversationBranch[];
  persistentMessages: Message[];
  persistentSelectedBranchIds: BranchSelectionMap;
  persistentThreadsMap: Map<string, ThreadMeta[]>;
  persistentThreadRuntimes: PersistentThreadRuntimeRecord;
  selectedChat: SelectedChat | null;
  temporaryChats: TemporaryChatSession[];
  threadSessionsById: Record<string, ThreadSession>;
  tempChatTitle: string;
}

export function useActiveConversationModel({
  activePendingRequest,
  conversationMapEnabled,
  conversationMapViewState,
  conversations,
  currentMapMessageId,
  draftChats,
  mentors,
  pendingBranch,
  persistentBranches,
  persistentMessages,
  persistentSelectedBranchIds,
  persistentThreadsMap,
  persistentThreadRuntimes,
  selectedChat,
  temporaryChats,
  threadSessionsById,
  tempChatTitle,
}: UseActiveConversationModelParams) {
  const selectedDraftChat = useMemo(
    () =>
      selectedChat?.kind === 'draft'
        ? draftChats.find((draft) => draft.id === selectedChat.draftId) || null
        : null,
    [draftChats, selectedChat]
  );
  const selectedTemporaryChat = useMemo(
    () =>
      selectedChat?.kind === 'temporary'
        ? temporaryChats.find((chat) => chat.id === selectedChat.tempChatId) || null
        : null,
    [selectedChat, temporaryChats]
  );
  const selectedConversation = useMemo(
    () =>
      selectedChat?.kind === 'persistent'
        ? conversations.find(
            (conversation) => conversation.id === selectedChat.conversationId
          ) || null
        : null,
    [conversations, selectedChat]
  );

  const selectedPersistentThreadRuntime = useMemo(
    () =>
      selectedChat?.kind === 'persistent'
        ? persistentThreadRuntimes[selectedChat.conversationId] ?? createEmptyPersistentThreadRuntime()
        : null,
    [persistentThreadRuntimes, selectedChat]
  );

  const isTemporaryChat = selectedChat?.kind === 'temporary';
  const activeMentorId =
    selectedChat?.kind === 'temporary' ? null : selectedChat?.mentorId ?? null;
  const activeMentor = useMemo(
    () =>
      activeMentorId ? mentors.find((mentor) => mentor.id === activeMentorId) || null : null,
    [activeMentorId, mentors]
  );
  const activeConversationId =
    selectedChat?.kind === 'persistent' ? selectedChat.conversationId : null;
  const activeConversationMessages = useMemo(
    () =>
      isTemporaryChat
        ? selectedTemporaryChat?.messages ?? EMPTY_MESSAGES
        : selectedChat?.kind === 'draft'
          ? selectedDraftChat?.messages ?? EMPTY_MESSAGES
          : selectedChat?.kind === 'persistent'
            ? persistentMessages
            : EMPTY_MESSAGES,
    [
      isTemporaryChat,
      persistentMessages,
      selectedChat?.kind,
      selectedDraftChat?.messages,
      selectedTemporaryChat?.messages,
    ]
  );
  const activeConversationBranches = useMemo(
    () =>
      isTemporaryChat
        ? selectedTemporaryChat?.branches ?? EMPTY_BRANCHES
        : selectedChat?.kind === 'draft'
          ? selectedDraftChat?.branches ?? EMPTY_BRANCHES
          : selectedChat?.kind === 'persistent'
            ? persistentBranches
            : EMPTY_BRANCHES,
    [
      isTemporaryChat,
      persistentBranches,
      selectedChat?.kind,
      selectedDraftChat?.branches,
      selectedTemporaryChat?.branches,
    ]
  );
  const activeSelectedBranchIds = useMemo(
    () =>
      isTemporaryChat
        ? selectedTemporaryChat?.selectedBranchIds ?? EMPTY_SELECTED_BRANCH_IDS
        : selectedChat?.kind === 'draft'
          ? selectedDraftChat?.selectedBranchIds ?? EMPTY_SELECTED_BRANCH_IDS
          : selectedChat?.kind === 'persistent'
            ? persistentSelectedBranchIds
            : EMPTY_SELECTED_BRANCH_IDS,
    [
      isTemporaryChat,
      persistentSelectedBranchIds,
      selectedChat?.kind,
      selectedDraftChat?.selectedBranchIds,
      selectedTemporaryChat?.selectedBranchIds,
    ]
  );

  const activeConversationStructureKey = activeConversationMessages
    .map((message) =>
      `${message.id}:${message.role}:${message.previousMessageId ?? ''}`
    )
    .join('|');
  const structuralMessagesRef = useRef<{
    key: string;
    messages: Message[];
  }>({ key: '', messages: EMPTY_MESSAGES });
  if (structuralMessagesRef.current.key !== activeConversationStructureKey) {
    structuralMessagesRef.current = {
      key: activeConversationStructureKey,
      messages: activeConversationMessages,
    };
  }
  const structuralConversationMessages =
    structuralMessagesRef.current.messages;
  const structuralActiveMessages = useMemo(
    () =>
      getActivePathMessages({
        messages: structuralConversationMessages,
        branches: activeConversationBranches,
        selectedBranchIds: activeSelectedBranchIds,
        pendingBranch,
      }),
    [
      activeConversationBranches,
      activeSelectedBranchIds,
      pendingBranch,
      structuralConversationMessages,
    ]
  );
  const activeMessages = useMemo(() => {
    const currentMessagesById = new Map(
      activeConversationMessages.map((message) => [message.id, message])
    );
    return structuralActiveMessages.map(
      (message) => currentMessagesById.get(message.id) ?? message
    );
  }, [activeConversationMessages, structuralActiveMessages]);
  const conversationMapMessages = conversationMapEnabled
    ? activeConversationMessages
    : EMPTY_MESSAGES;
  const conversationMapModel = useMemo(
    () => {
      if (!conversationMapEnabled) {
        return EMPTY_CONVERSATION_MAP_MODEL;
      }
      recordHomePerformanceEvent('conversation-map-model-build');
      return buildConversationMapModel({
        messages: conversationMapMessages,
        branches: activeConversationBranches,
        selectedBranchIds: activeSelectedBranchIds,
        pendingBranchSourceMessageId: pendingBranch?.sourceMessageId ?? null,
        currentMessageId: currentMapMessageId,
        zoom: conversationMapViewState.zoom,
      });
    },
    [
      activeConversationBranches,
      conversationMapMessages,
      activeSelectedBranchIds,
      conversationMapEnabled,
      conversationMapViewState.zoom,
      currentMapMessageId,
      pendingBranch?.sourceMessageId,
    ]
  );
  const activeThreadsMap = useMemo(
    () =>
      isTemporaryChat
        ? recordToThreadsMap(selectedTemporaryChat?.threadsMap)
        : selectedChat?.kind === 'persistent'
          ? mergeThreadsMaps(
              persistentThreadsMap,
              recordToThreadsMap(selectedPersistentThreadRuntime?.threadsMap)
            )
          : new Map<string, ThreadMeta[]>(),
    [
      isTemporaryChat,
      persistentThreadsMap,
      selectedChat?.kind,
      selectedPersistentThreadRuntime?.threadsMap,
      selectedTemporaryChat?.threadsMap,
    ]
  );
  const activeThreadStatuses = isTemporaryChat
    ? selectedTemporaryChat?.threadStatuses
    : selectedChat?.kind === 'persistent'
      ? selectedPersistentThreadRuntime?.threadStatuses
      : undefined;
  const activeThreadMarkersMap = useMemo(
    () =>
      buildInlineThreadMarkersMap({
        persistedThreadsMap: activeThreadsMap,
        threadStatuses: activeThreadStatuses,
        threadSessionsById,
      }),
    [activeThreadStatuses, activeThreadsMap, threadSessionsById]
  );
  const branchChipsByMessageId = useMemo(
    () =>
      new Map(
        structuralActiveMessages
          .filter((message) => message.role === 'assistant')
          .map((message) => [
            message.id,
            getBranchChipsForMessage({
              sourceMessageId: message.id,
              messages: structuralConversationMessages,
              branches: activeConversationBranches,
              selectedBranchIds: activeSelectedBranchIds,
              pendingBranch,
            }),
          ] as const)
          .filter(([, chips]) => chips.length > 0)
      ),
    [
      activeConversationBranches,
      activeSelectedBranchIds,
      pendingBranch,
      structuralActiveMessages,
      structuralConversationMessages,
    ]
  );
  const conversationTitle = isTemporaryChat
    ? selectedTemporaryChat?.title ?? tempChatTitle
    : selectedChat?.kind === 'draft'
      ? selectedDraftChat?.title ?? 'New chat'
      : selectedConversation?.title ?? 'New chat';
  const isActiveConversationLoading =
    activePendingRequest?.phase === 'awaiting-response'
    && activeMessages.some((message) => message.id === activePendingRequest.userMessageId);
  const emptyTitle = isTemporaryChat
    ? tempChatTitle
    : selectedChat?.kind === 'draft'
      ? 'New chat'
      : activeMentor
        ? `Talk to ${activeMentor.name}`
        : 'What are we exploring today?';
  const emptySubtitle = isTemporaryChat
    ? "This conversation won't be saved."
    : selectedChat?.kind === 'draft'
      ? activeMentor?.tagline || 'Start a new conversation.'
      : activeMentor
        ? activeMentor.tagline
        : 'Start typing, or choose a mentor from the grid.';

  return {
    activeConversationBranches,
    activeConversationId,
    activeConversationMessages,
    activeMessages,
    activeSelectedBranchIds,
    activeThreadMarkersMap,
    branchChipsByMessageId,
    conversationTitle,
    conversationMapModel,
    emptySubtitle,
    emptyTitle,
    isActiveConversationLoading,
    isTemporaryChat,
    selectedDraftChat,
    selectedTemporaryChat,
  };
}

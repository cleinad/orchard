"use client";

import {
  Suspense,
  useState,
  useCallback,
  useRef,
  useEffect,
  type CSSProperties,
} from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  SIDE_PANEL_COLLAPSED_WIDTH_PX,
  useSidePanel,
} from '@/app/home/components/SidePanelContext';
import {
  useHomeDataContext,
  type SelectedChat,
  type PersistentDraftChat,
  type TemporaryChatSession,
} from '@/app/home/components/HomeDataContext';
import HomeBackground from '@/app/home/components/HomeBackground';
import HomeHeader from '@/app/home/components/HomeHeader';
import ChatComposer from '@/app/home/components/ChatComposer';
import {
  uploadChatImageAttachments,
} from '@/app/home/components/chatImageUploads';
import ConversationMap from '@/app/home/components/ConversationMap';
import ConversationView from '@/app/home/components/ConversationView';
import type { PendingBranchTarget } from '@/app/home/components/conversationTree';
import {
  useMainChatRuntime,
} from '@/app/home/components/useMainChatRuntime';
import {
  getSelectedChatKey,
} from '@/app/home/components/homeSelection';
import {
  clearInitialSendHandoff,
  readInitialSendHandoff,
} from '@/app/home/components/initialSendHandoff';
import type { PersistentThreadRuntimeRecord } from '@/app/home/components/persistentThreadRuntime';
import { useHomeThreads } from '@/app/home/components/useHomeThreads';
import { useHomeFixtureRuntime } from '@/app/home/components/useHomeFixtureRuntime';
import { useHomeChatSwitchLifecycle } from '@/app/home/components/useHomeChatSwitchLifecycle';
import { useInlineThreadRuntime } from '@/app/home/components/useInlineThreadRuntime';
import { getTemporaryChatAttachmentStoragePaths } from '@/app/home/components/temporaryChatAttachmentCleanup';
import { useConversationMapState } from '@/app/home/components/useConversationMapState';
import { useConversationMapRuntime } from '@/app/home/components/useConversationMapRuntime';
import { useChatModelCatalog } from '@/app/home/components/useChatModelCatalog';
import {
  CHAT_MODEL_EFFORT_OVERRIDES_STORAGE_KEY,
  CHAT_MODEL_STORAGE_KEY,
  CHAT_MODEL_THINKING_OVERRIDES_STORAGE_KEY,
  isChatModelEffortOverrides,
  isChatModelThinkingOverrides,
} from '@/app/home/components/chatPreferencePersistence';
import { useActiveConversationModel } from '@/app/home/components/useActiveConversationModel';
import { usePendingChatRequests } from '@/app/home/components/usePendingChatRequests';
import { usePerChatComposerState } from '@/app/home/components/usePerChatComposerState';
import { usePersistedJson } from '@/app/home/components/usePersistedJson';
import { usePersistedString } from '@/app/home/components/usePersistedString';
import { useRouteConversationHydration } from '@/app/home/components/useRouteConversationHydration';
import { useTranscriptNavigation } from '@/app/home/components/useTranscriptNavigation';
import {
  GOOGLE_GIF_UNSUPPORTED_MESSAGE,
  IMAGE_MODEL_UNSUPPORTED_MESSAGE,
  useChatImageComposerState,
} from '@/app/home/components/useChatImageComposerState';
import type {
  ThreadMeta,
  ThreadSession,
} from '@/app/home/components/threadTypes';
import {
  DEFAULT_CHAT_MODEL_ID,
  isChatModelId,
  type ChatModelEffortOverrides,
  type ChatModelEffortLevel,
  type ChatModelId,
  type ChatModelThinkingOverrides,
} from '@/lib/chat-models';
import { LearningModeProvider, useLearningMode } from '@/app/home/components/LearningModeContext';
import TextSelectionPopover from '@/app/home/components/TextSelectionPopover';
import ThreadPanel, {
  THREAD_PANEL_DEFAULT_WIDTH_PX,
  clampThreadPanelWidthPx,
} from '@/app/home/components/ThreadPanel';
import type {
  BranchSelectionMap,
  ConversationBranch,
  ConversationListItem,
  Message,
} from '@/app/home/types';
import { getHomeE2eFixture } from '@/app/home/e2eFixtures';
import { CHAT_IMAGE_BUCKET, type ChatImageAttachment } from '@/lib/chat-attachments';
import type { TemporaryMemoryMode } from '@/lib/chat-session';
import { supabase } from '@/lib/supabase';

const COMPOSER_DRAFT_INPUTS_STORAGE_KEY = 'keen-home-composer-draft-inputs-v1';
const RESPONSE_STYLE_STORAGE_KEY = 'keen-home-response-styles-v1';
const PERSISTENT_THREAD_RUNTIME_STORAGE_KEY = 'keen-persistent-thread-runtime-v1';
const THREAD_PANEL_WIDTH_STORAGE_KEY = 'keen-thread-panel-width-v1';
const TEMP_CHAT_TITLE = 'Temporary chat';

function findLatestConversationForMentor(
  mentorId: string | null,
  conversations: ConversationListItem[]
) {
  return conversations.find(
    (conversation) =>
      conversation.mentor_id === mentorId && conversation.workspace_id === null
  ) || null;
}

/**
 * Home page - editorial tone and text conversation interface
 */
export default function HomePage() {
  return (
    <Suspense>
      <LearningModeProvider>
        <HomePageInner />
      </LearningModeProvider>
    </Suspense>
  );
}

function HomePageInner() {
  const [selectedModelId, setSelectedModelId] = usePersistedString<ChatModelId>(
    CHAT_MODEL_STORAGE_KEY,
    DEFAULT_CHAT_MODEL_ID,
    isChatModelId
  );
  const [modelEffortOverrides, setModelEffortOverrides] =
    usePersistedJson<ChatModelEffortOverrides>(
      CHAT_MODEL_EFFORT_OVERRIDES_STORAGE_KEY,
      {},
      isChatModelEffortOverrides
    );
  const [thinkingEnabledOverrides, setThinkingEnabledOverrides] =
    usePersistedJson<ChatModelThinkingOverrides>(
      CHAT_MODEL_THINKING_OVERRIDES_STORAGE_KEY,
      {},
      isChatModelThinkingOverrides
  );
  const chatModels = useChatModelCatalog(selectedModelId, setSelectedModelId);
  const selectedChatModel = chatModels.find((model) => model.id === selectedModelId) ?? null;
  const selectedModelEffortCandidate = modelEffortOverrides[selectedModelId] ?? null;
  const selectedModelEffortOverride = selectedChatModel?.effort
    && selectedModelEffortCandidate
    && selectedChatModel.effort.levels.includes(selectedModelEffortCandidate)
      ? selectedModelEffortCandidate
      : null;
  const hasThinkingEnabledOverride = Object.prototype.hasOwnProperty.call(
    thinkingEnabledOverrides,
    selectedModelId
  );
  const thinkingEnabledOverride = hasThinkingEnabledOverride
    ? thinkingEnabledOverrides[selectedModelId] ?? null
    : null;
  const updateSelectedModelEffort = useCallback(
    (modelId: ChatModelId, effort: ChatModelEffortLevel) => {
      setModelEffortOverrides((current) => ({
        ...current,
        [modelId]: effort,
      }));
    },
    [setModelEffortOverrides]
  );
  const updateThinkingEnabled = useCallback(
    (modelId: ChatModelId, enabled: boolean) => {
      setThinkingEnabledOverrides((current) => ({
        ...current,
        [modelId]: enabled,
      }));
    },
    [setThinkingEnabledOverrides]
  );
  const {
    imageInputDisabledReason,
    imageWarning,
    isUploadingImages,
    pendingImageAttachments,
    selectedModelRejectsGifImages,
    selectedModelSupportsImages,
    clearPendingImageAttachments,
    handleAttachImages,
    handleModelChange,
    handleRemoveImageAttachment,
    setImageWarning,
    setIsUploadingImages,
    setPendingImageAttachments,
  } = useChatImageComposerState({
    chatModels,
    selectedChatModel,
    setSelectedModelId,
  });
  const [persistentMessages, setPersistentMessages] = useState<Message[]>([]);
  const [persistentBranches, setPersistentBranches] = useState<ConversationBranch[]>([]);
  const [persistentSelectedBranchIds, setPersistentSelectedBranchIds] =
    useState<BranchSelectionMap>({});
  const [persistentThreadsMap, setPersistentThreadsMap] = useState<Map<string, ThreadMeta[]>>(
    new Map()
  );
  const [persistentThreadRuntimes, setPersistentThreadRuntimes] =
    useState<PersistentThreadRuntimeRecord>({});
  const [pendingBranch, setPendingBranch] = useState<PendingBranchTarget | null>(null);
  const [currentMapMessageId, setCurrentMapMessageId] = useState<string | null>(null);
  const [isDesktopViewport, setIsDesktopViewport] = useState(false);
  const [threadPanelWidthPx, setThreadPanelWidthPxState] = useState(
    THREAD_PANEL_DEFAULT_WIDTH_PX
  );
  const [hasLoadedThreadPanelWidth, setHasLoadedThreadPanelWidth] = useState(false);

  const { learningMode } = useLearningMode();
  const { isOpen: sidePanelOpen, widthPx: sidePanelWidthPx } = useSidePanel();
  const mainStyle = {
    '--side-panel-width': `${sidePanelWidthPx}px`,
    '--thread-panel-width': `${threadPanelWidthPx}px`,
  } as CSSProperties;
  const setThreadPanelWidthPx = useCallback((nextWidthPx: number) => {
    setThreadPanelWidthPxState(clampThreadPanelWidthPx(nextWidthPx));
  }, []);

  useEffect(() => {
    const stored = window.localStorage.getItem(THREAD_PANEL_WIDTH_STORAGE_KEY);
    const parsed = stored === null ? Number.NaN : Number(stored);

    if (stored !== null) {
      setThreadPanelWidthPxState(clampThreadPanelWidthPx(parsed));
    }

    setHasLoadedThreadPanelWidth(true);
  }, []);

  useEffect(() => {
    if (!hasLoadedThreadPanelWidth) {
      return;
    }

    window.localStorage.setItem(THREAD_PANEL_WIDTH_STORAGE_KEY, String(threadPanelWidthPx));
  }, [hasLoadedThreadPanelWidth, threadPanelWidthPx]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 1024px)');
    const syncViewport = () => {
      setIsDesktopViewport(mediaQuery.matches);
    };

    syncViewport();
    mediaQuery.addEventListener('change', syncViewport);

    return () => mediaQuery.removeEventListener('change', syncViewport);
  }, []);

  const {
    mentors,
    conversations,
    loadingLists,
    listError,
    setListError,
    refreshSidebarData,
    upsertSidebarConversation,
    loadConversationById,
    loadConversationMessages,
    getOrCreateDraft,
    draftChats,
    setDraftChats,
    temporaryChats,
    setTemporaryChats,
    updateDraftChat,
    updateTemporaryChat,
    selectedChat,
    setSelectedChat,
    selectedChatRef,
    handleCreateDraftSelection,
    handleCreateTemporaryChat,
    registerPrepareForChatSwitch,
    invokePrepareForChatSwitch,
    registerCloseTempChatCleanup,
    replacePersistentConversationUrl,
    routeConversationId,
  } = useHomeDataContext();

  const params = useParams<{ conversationId?: string[] }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const paramRouteConversationId =
    Array.isArray(params.conversationId) && params.conversationId.length > 0
      ? params.conversationId[0]
      : null;
  const effectiveRouteConversationId = paramRouteConversationId ?? routeConversationId;
  const homeE2eFixture = getHomeE2eFixture(searchParams.get('e2e'));
  const isHomeE2eFixture = homeE2eFixture !== null;

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const splitPaneRef = useRef<HTMLDivElement>(null);
  const {
    popoverState,
    highlightSource,
    activeSession,
    threadPanelOpen,
    threadSessionsById,
    resetThreadUi,
    dismissPopover,
    handlePointerUp,
    createThreadSession,
    updateThreadSession,
    activateThreadSession,
    closeThreadPanel,
    findThreadSessionId,
  } = useHomeThreads(learningMode, containerRef);
  const selectedChatKey = getSelectedChatKey(selectedChat);
  const {
    isOpen: conversationMapOpen,
    viewState: conversationMapViewState,
    followModePaused: conversationMapFollowModePaused,
    setOpen: setConversationMapOpen,
    toggleOpen: toggleConversationMapOpen,
    updateViewState: updateConversationMapViewState,
    setFollowModePaused: setConversationMapFollowModePaused,
    clampSplitRatio,
  } = useConversationMapState(selectedChatKey);
  const composerStateSelection: SelectedChat | null = selectedChat ?? (
    effectiveRouteConversationId
      ? {
          kind: 'persistent',
          conversationId: effectiveRouteConversationId,
          mentorId: null,
          workspaceId: null,
        }
      : null
  );
  const {
    activeResponseStyle,
    activeSearchState,
    activeSearchMode,
    composerDraftInputsRef,
    input,
    clearInputForSelection: clearComposerInputForSelection,
    clearResponseStyleForSelection,
    clearSearchModeForSelection,
    clearSearchStateForSelection,
    moveResponseStyleBetweenSelections,
    moveSearchModeBetweenSelections,
    resetAllComposerState,
    setInputForSelection: setComposerInputForSelection,
    setResponseStyleForSelection,
    setSearchModeForSelection,
    setSearchStateForSelection,
  } = usePerChatComposerState({
    responseStyleStorageKey: RESPONSE_STYLE_STORAGE_KEY,
    storageKey: COMPOSER_DRAFT_INPUTS_STORAGE_KEY,
    selection: composerStateSelection,
  });
  const {
    activePendingRequest: activePendingChatRequest,
    isLoading,
    pendingChatRequestsRef,
    clearPendingRequest: clearPendingChatRequestForSelection,
    movePendingRequest: movePendingChatRequestBetweenSelections,
    resetPendingRequests,
    setPendingPhase: setPendingChatRequestPhaseForSelection,
    setPendingRequest: setPendingChatRequestForSelection,
  } = usePendingChatRequests(selectedChat);
  const {
    activeConversationBranches,
    activeConversationId,
    activeConversationMessages,
    activeMessages,
    activeName,
    activeTemporaryMemoryMode,
    activeThreadMarkersMap,
    branchChipsByMessageId,
    conversationMapModel,
    emptySubtitle,
    emptyTitle,
    isActiveConversationLoading,
    isTemporaryChat,
    selectedDraftChat,
    selectedTemporaryChat,
  } = useActiveConversationModel({
    activePendingRequest: activePendingChatRequest,
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
    tempChatTitle: TEMP_CHAT_TITLE,
  });
  const hasConversationMap = conversationMapModel.branchPointIds.size > 0;
  const {
    endProgrammaticTranscriptNavigation,
    handleScroll,
    jumpToMessage,
    scrollInstantRef,
    setUserHasScrolledState,
  } = useTranscriptNavigation({
    activeMessages,
    containerRef,
    currentMapMessageId,
    messagesEndRef,
    setCurrentMapMessageId,
  });

  const mentorSlugHandledRef = useRef(false);
  const selectedDraftChatRef = useRef<PersistentDraftChat | null>(null);
  const persistentSelectedBranchIdsRef = useRef<BranchSelectionMap>({});
  const persistentThreadRuntimesRef = useRef<PersistentThreadRuntimeRecord>({});
  const temporaryChatsRef = useRef<TemporaryChatSession[]>([]);
  const threadSessionsRef = useRef<Record<string, ThreadSession>>({});

  useEffect(() => {
    // Draft promotion and branch/thread handlers read these latest values from callbacks.
    persistentSelectedBranchIdsRef.current = persistentSelectedBranchIds;
    persistentThreadRuntimesRef.current = persistentThreadRuntimes;
    temporaryChatsRef.current = temporaryChats;
    threadSessionsRef.current = threadSessionsById;
  }, [
    persistentSelectedBranchIds,
    persistentThreadRuntimes,
    temporaryChats,
    threadSessionsById,
  ]);
  const {
    hydratedRouteConversationIdRef,
    routeConversationError,
    shouldShowRouteConversationError,
    shouldShowRouteConversationLoading,
  } = useRouteConversationHydration({
    activeMessagesLength: activeMessages.length,
    effectiveRouteConversationId,
    isHomeE2eFixture,
    listError,
    loadConversationById,
    loadConversationMessages,
    persistentMessagesLength: persistentMessages.length,
    selectedChat,
    selectedChatRef,
    invokePrepareForChatSwitch,
    setListError,
    setPersistentBranches,
    setPersistentMessages,
    setPersistentSelectedBranchIds,
    setPersistentThreadsMap,
    setSelectedChat,
  });

  useEffect(() => {
    if (selectedChat?.kind === 'draft' && !selectedDraftChat) {
      setSelectedChat(null);
    }
  }, [selectedChat, selectedDraftChat]);

  useEffect(() => {
    if (selectedChat?.kind === 'temporary' && !selectedTemporaryChat) {
      setSelectedChat(null);
    }
  }, [selectedChat, selectedTemporaryChat]);

  useEffect(() => {
    if (!hasConversationMap && conversationMapOpen) {
      setConversationMapOpen(false);
    }
  }, [conversationMapOpen, hasConversationMap, setConversationMapOpen]);

  useEffect(() => {
    if (popoverState || threadPanelOpen) {
      setConversationMapOpen(false);
    }
  }, [popoverState, setConversationMapOpen, threadPanelOpen]);

  useEffect(() => {
    if (isHomeE2eFixture || mentorSlugHandledRef.current || effectiveRouteConversationId) return;
    const mentorSlug = searchParams.get('mentor');
    if (!mentorSlug || loadingLists) return;
    if (mentors.length === 0 && !listError) return;

    mentorSlugHandledRef.current = true;
    const target = mentors.find((mentor) => mentor.slug === mentorSlug);

    if (target) {
      const latestConversation = findLatestConversationForMentor(
        target.id,
        conversations
      );

      if (latestConversation) {
        router.replace(`/home/${encodeURIComponent(latestConversation.id)}`, {
          scroll: false,
        });
      } else {
        handleCreateDraftSelection(target.id);
        router.replace('/home', { scroll: false });
      }
    } else {
      router.replace('/home', { scroll: false });
    }
  }, [
    effectiveRouteConversationId,
    searchParams,
    loadingLists,
    mentors,
    conversations,
    router,
    listError,
    isHomeE2eFixture,
  ]);

  const cleanupTemporaryChatAttachments = useCallback((tempChatId: string) => {
    const storagePaths = getTemporaryChatAttachmentStoragePaths(
      temporaryChatsRef.current,
      tempChatId
    );

    if (storagePaths.length > 0) {
      void supabase.storage.from(CHAT_IMAGE_BUCKET).remove(storagePaths);
    }
  }, []);

  const previousSelectedChatKeyRef = useRef<string | null>(selectedChatKey);
  useEffect(() => {
    if (previousSelectedChatKeyRef.current === selectedChatKey) {
      return;
    }

    previousSelectedChatKeyRef.current = selectedChatKey;
    clearPendingImageAttachments();
  }, [clearPendingImageAttachments, selectedChatKey]);

  useHomeFixtureRuntime({
    composerDraftInputsStorageKey: COMPOSER_DRAFT_INPUTS_STORAGE_KEY,
    endProgrammaticTranscriptNavigation,
    fixture: homeE2eFixture,
    resetAllComposerState,
    resetPendingRequests,
    resetThreadUi,
    setDraftChats,
    setListError,
    setPendingBranch,
    setPersistentBranches,
    setPersistentMessages,
    setPersistentSelectedBranchIds,
    setPersistentThreadsMap,
    setSelectedChat,
    setTemporaryChats,
    setUserHasScrolledState,
    tempChatTitle: TEMP_CHAT_TITLE,
  });

  useHomeChatSwitchLifecycle({
    clearComposerInputForSelection,
    clearPendingChatRequestForSelection,
    clearResponseStyleForSelection,
    clearSearchModeForSelection,
    clearSearchStateForSelection,
    cleanupTemporaryChatAttachments,
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
  });

  const {
    handleSendThreadMessage,
    handleThreadMarkerClick,
    handleThreadPanelInputChange,
    openThreadDraft,
    submitThreadQuestion,
  } = useInlineThreadRuntime({
    activeConversationId,
    activeMessages,
    activeTemporaryMemoryMode,
    activateThreadSession,
    createThreadSession,
    findThreadSessionId,
    persistentThreadRuntimes,
    persistentThreadRuntimesRef,
    selectedChat,
    selectedChatRef,
    selectedModelId,
    selectedModelEffort: selectedModelEffortOverride,
    thinkingEnabled: thinkingEnabledOverride,
    responseStyle: activeResponseStyle,
    searchMode: activeSearchMode,
    selectedTemporaryChat,
    setPersistentThreadRuntimes,
    setPersistentThreadsMap,
    storageKey: PERSISTENT_THREAD_RUNTIME_STORAGE_KEY,
    threadSessionsRef,
    updateTemporaryChat,
    updateThreadSession,
  });

  const updateSelectedTemporaryMemoryMode = useCallback(
    (mode: TemporaryMemoryMode) => {
      if (selectedChat?.kind !== 'temporary') {
        return;
      }

      updateTemporaryChat(selectedChat.tempChatId, (chat) => ({
        ...chat,
        memoryMode: mode,
      }));
    },
    [selectedChat, updateTemporaryChat]
  );

  const {
    handleCreateBranch,
    handleSelectBranch,
    handleSelectMessageFromMap,
    handleStartMapResize,
    handleToggleConversationMap,
  } = useConversationMapRuntime({
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
  });

  const sendMessage = useMainChatRuntime({
    activeMessages,
    clearComposerInputForSelection,
    clearPendingChatRequestForSelection,
    clearSearchStateForSelection,
    getOrCreateDraft,
    hydratedRouteConversationIdRef,
    isHomeE2eFixture,
    loadConversationMessages,
    movePendingChatRequestBetweenSelections,
    moveResponseStyleBetweenSelections,
    moveSearchModeBetweenSelections,
    pendingBranch,
    pendingChatRequestsRef,
    persistentBranches,
    persistentMessages,
    persistentSelectedBranchIds,
    persistentSelectedBranchIdsRef,
    refreshSidebarData,
    upsertSidebarConversation,
    responseStyle: activeResponseStyle,
    searchMode: activeSearchMode,
    selectedChat,
    selectedChatRef,
    selectedDraftChat,
    selectedModelId,
    selectedModelEffort: selectedModelEffortOverride,
    thinkingEnabled: thinkingEnabledOverride,
    selectedTemporaryChat,
    setDraftChats,
    setListError,
    setPendingBranch,
    setPendingChatRequestForSelection,
    setPendingChatRequestPhaseForSelection,
    setPersistentBranches,
    setPersistentMessages,
    setPersistentSelectedBranchIds,
    setPersistentThreadsMap,
    replacePersistentConversationUrl,
    setSearchStateForSelection,
    setSelectedChat,
    setUserHasScrolledState,
    temporaryChatsRef,
    tempChatTitle: TEMP_CHAT_TITLE,
    updateDraftChat,
    updateTemporaryChat,
  });

  const consumedInitialSendConversationIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (shouldShowRouteConversationLoading || selectedChat?.kind !== 'persistent') {
      return;
    }

    const handoff = readInitialSendHandoff(selectedChat.conversationId);
    if (!handoff) {
      return;
    }

    clearInitialSendHandoff();

    if (consumedInitialSendConversationIdsRef.current.has(handoff.conversationId)) {
      return;
    }
    consumedInitialSendConversationIdsRef.current.add(handoff.conversationId);

    setSelectedModelId(handoff.modelId);
    setModelEffortOverrides((current) => {
      if (handoff.modelEffort) {
        return {
          ...current,
          [handoff.modelId]: handoff.modelEffort,
        };
      }

      const next = { ...current };
      delete next[handoff.modelId];
      return next;
    });
    setThinkingEnabledOverrides((current) => {
      if (handoff.thinkingEnabled !== null) {
        return {
          ...current,
          [handoff.modelId]: handoff.thinkingEnabled,
        };
      }

      const next = { ...current };
      delete next[handoff.modelId];
      return next;
    });
    setResponseStyleForSelection(selectedChat, handoff.responseStyle);
    setSearchModeForSelection(selectedChat, handoff.searchMode);

    void sendMessage(handoff.message, {
      modelId: handoff.modelId,
      modelEffort: handoff.modelEffort,
      thinkingEnabled: handoff.thinkingEnabled,
      responseStyle: handoff.responseStyle,
      searchMode: handoff.searchMode,
      uploadedAttachments: handoff.uploadedAttachments,
    }).then((result) => {
      if (!result.accepted && result.error) {
        setImageWarning(result.error);
      }
      if (
        !result.accepted
        && result.cleanupUploadedAttachments
        && result.cleanupUploadedAttachments.length > 0
      ) {
        void supabase.storage
          .from(CHAT_IMAGE_BUCKET)
          .remove(result.cleanupUploadedAttachments.map((attachment) => attachment.storagePath));
      }
    });
  }, [
    selectedChat,
    sendMessage,
    setImageWarning,
    setModelEffortOverrides,
    setResponseStyleForSelection,
    setSearchModeForSelection,
    setSelectedModelId,
    setThinkingEnabledOverrides,
    shouldShowRouteConversationLoading,
  ]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const textToSend = input.trim();
    const imagesToSend = pendingImageAttachments;
    let shouldRevokeLocalImageUrls = imagesToSend.length > 0;

    if (!textToSend && imagesToSend.length === 0) {
      return;
    }

    if (imagesToSend.length > 0 && !selectedModelSupportsImages) {
      setImageWarning(IMAGE_MODEL_UNSUPPORTED_MESSAGE);
      return;
    }

    if (
      selectedModelRejectsGifImages
      && imagesToSend.some((attachment) => attachment.mimeType === 'image/gif')
    ) {
      setImageWarning(GOOGLE_GIF_UNSUPPORTED_MESSAGE);
      return;
    }

    try {
      if (imagesToSend.length > 0) {
        setIsUploadingImages(true);
      }
      setImageWarning(null);

      const displayAttachments: ChatImageAttachment[] = imagesToSend.map((attachment) => ({
        id: attachment.id,
        storagePath: '',
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
        width: attachment.width,
        height: attachment.height,
        url: attachment.url,
      }));

      setPendingImageAttachments([]);
      const result = await sendMessage(textToSend, {
        displayAttachments,
        prepareUploadedAttachments: () => uploadChatImageAttachments(imagesToSend),
      });

      if (!result.accepted && result.error) {
        setImageWarning(result.error);
      }

      if (!result.accepted && textToSend) {
        setComposerInputForSelection(
          result.restoreComposerSelection ?? composerStateSelection,
          textToSend
        );
      }

      if (!result.accepted && imagesToSend.length > 0) {
        setPendingImageAttachments(imagesToSend);
        shouldRevokeLocalImageUrls = false;
      }

      if (
        !result.accepted
        && result.cleanupUploadedAttachments
        && result.cleanupUploadedAttachments.length > 0
      ) {
        await supabase.storage
          .from(CHAT_IMAGE_BUCKET)
          .remove(result.cleanupUploadedAttachments.map((attachment) => attachment.storagePath));
      }
    } catch (error) {
      setImageWarning(error instanceof Error ? error.message : 'Failed to upload image.');
      if (textToSend) {
        setComposerInputForSelection(composerStateSelection, textToSend);
      }
      if (imagesToSend.length > 0) {
        setPendingImageAttachments(imagesToSend);
        shouldRevokeLocalImageUrls = false;
      }
    } finally {
      if (shouldRevokeLocalImageUrls) {
        for (const attachment of imagesToSend) {
          URL.revokeObjectURL(attachment.url);
        }
      }
      if (imagesToSend.length > 0) {
        setIsUploadingImages(false);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit(e);
    }
  };

  return (
    <>
      <HomeBackground />

      <main
        data-side-panel-open={sidePanelOpen}
        data-thread-panel-open={threadPanelOpen}
        className="home-main-shell relative flex min-h-0 flex-1 flex-col transition-[padding] duration-300 ease-out"
        style={mainStyle}
      >
        <div className="w-full shrink-0 px-6">
          <HomeHeader
            activeName={activeName}
            isTemporaryChat={isTemporaryChat}
            temporaryMemoryMode={activeTemporaryMemoryMode}
            loadingLists={loadingLists}
            onCreateTemporaryChat={handleCreateTemporaryChat}
            conversationMapBranchPointCount={conversationMapModel.branchPointIds.size}
            conversationMapOpen={conversationMapOpen}
            onToggleConversationMap={handleToggleConversationMap}
          />
        </div>

        <div className="relative min-h-0 flex-1">
          <div
            ref={splitPaneRef}
            className="flex h-full min-h-0"
          >
            <div
              data-testid="home-scroll-container"
              ref={containerRef}
              onScroll={handleScroll}
              className="relative min-h-0 flex-1 overflow-y-auto"
              style={{
                scrollbarWidth: 'thin',
                scrollbarColor: 'rgba(0,0,0,0.08) transparent',
                flexBasis:
                  conversationMapOpen && hasConversationMap && isDesktopViewport
                    ? `calc(${(1 - conversationMapViewState.splitRatio) * 100}% - 0.5rem)`
                    : undefined,
              }}
            >
              <ConversationView
                activeHighlightSource={highlightSource}
                listError={shouldShowRouteConversationError ? null : listError}
                routeConversationError={routeConversationError}
                messages={activeMessages}
                activeName={activeName}
                emptyTitle={emptyTitle}
                emptySubtitle={emptySubtitle}
                isLoading={isActiveConversationLoading}
                isRouteConversationLoading={shouldShowRouteConversationLoading}
                threadsMap={activeThreadMarkersMap}
                branchChipsByMessageId={branchChipsByMessageId}
                pendingBranchSourceMessageId={pendingBranch?.sourceMessageId ?? null}
                messagesEndRef={messagesEndRef}
                onThreadClick={handleThreadMarkerClick}
                onSelectBranch={handleSelectBranch}
                onCreateBranch={handleCreateBranch}
                onAssistantPointerUp={handlePointerUp}
              />
              <TextSelectionPopover
                popoverState={popoverState}
                onDismiss={dismissPopover}
                onSubmitQuestion={submitThreadQuestion}
                onOpenThreadDraft={openThreadDraft}
              />
            </div>

            {conversationMapOpen && hasConversationMap && isDesktopViewport && (
              <>
                <div className="pointer-events-none relative z-10 hidden w-4 shrink-0 lg:block">
                  <div className="absolute left-1/2 top-8 h-[calc(100%-4rem)] w-px -translate-x-1/2 bg-border-subtle" />
                  <div
                    data-testid="conversation-map-resize-handle"
                    onPointerDown={handleStartMapResize}
                    className="pointer-events-auto absolute left-1/2 top-1/2 h-16 w-2 -translate-x-1/2 -translate-y-1/2 cursor-col-resize rounded-full bg-foreground/[0.08]"
                  />
                </div>
                <div
                  className="hidden min-h-0 lg:block"
                  style={{
                    flexBasis: `${conversationMapViewState.splitRatio * 100}%`,
                  }}
                >
                  <ConversationMap
                    model={conversationMapModel}
                    currentMessageId={currentMapMessageId}
                    viewState={conversationMapViewState}
                    followModePaused={conversationMapFollowModePaused}
                    testId="conversation-map-desktop"
                    variant="desktop"
                    onClose={() => setConversationMapOpen(false)}
                    onSelectMessage={handleSelectMessageFromMap}
                    onViewStateChange={updateConversationMapViewState}
                    onFollowModePausedChange={setConversationMapFollowModePaused}
                  />
                </div>
              </>
            )}
          </div>
        </div>

        <ChatComposer
          activeName={activeName}
          chatModels={chatModels}
          input={input}
          isLoading={isLoading}
          imageInputDisabledReason={imageInputDisabledReason}
          isUploadingImages={isUploadingImages}
          pendingImageAttachments={pendingImageAttachments}
          responseStyle={activeResponseStyle}
          selectedModelId={selectedModelId}
          modelEffortOverrides={modelEffortOverrides}
          thinkingEnabledOverrides={thinkingEnabledOverrides}
          searchMode={activeSearchMode}
          temporaryChatEnabled={isTemporaryChat}
          showTemporaryIntro={isTemporaryChat && activeMessages.length === 0}
          temporaryMemoryMode={activeTemporaryMemoryMode}
          searchWarning={activeSearchState?.warning ?? null}
          imageWarning={imageWarning}
          textareaRef={textareaRef}
          onInputChange={(value) => setComposerInputForSelection(composerStateSelection, value)}
          onAttachImages={handleAttachImages}
          onImageWarning={setImageWarning}
          onRemoveImageAttachment={handleRemoveImageAttachment}
          onModelChange={handleModelChange}
          onModelEffortChange={updateSelectedModelEffort}
          onThinkingEnabledChange={updateThinkingEnabled}
          onResponseStyleChange={(value) =>
            setResponseStyleForSelection(composerStateSelection, value)
          }
          onSearchModeChange={(mode) => setSearchModeForSelection(composerStateSelection, mode)}
          onTemporaryMemoryModeChange={updateSelectedTemporaryMemoryMode}
          onSubmit={handleSubmit}
          onKeyDown={handleKeyDown}
        />

        {conversationMapOpen && hasConversationMap && !isDesktopViewport && (
          <div className="fixed inset-0 z-50 bg-background/92 p-3 backdrop-blur-sm lg:hidden">
            <ConversationMap
              model={conversationMapModel}
              currentMessageId={currentMapMessageId}
              viewState={conversationMapViewState}
              followModePaused={conversationMapFollowModePaused}
              testId="conversation-map-mobile"
              variant="mobile"
              onClose={() => setConversationMapOpen(false)}
              onSelectMessage={handleSelectMessageFromMap}
              onViewStateChange={updateConversationMapViewState}
              onFollowModePausedChange={setConversationMapFollowModePaused}
            />
          </div>
        )}
      </main>

      <ThreadPanel
        isOpen={threadPanelOpen}
        widthPx={threadPanelWidthPx}
        session={activeSession}
        temporaryChatEnabled={isTemporaryChat}
        suspendCloseShortcut={Boolean(popoverState)}
        onWidthChange={setThreadPanelWidthPx}
        onInputChange={handleThreadPanelInputChange}
        onSend={handleSendThreadMessage}
        onClose={closeThreadPanel}
      />

      <style jsx>{`
        .home-main-shell {
          padding-left: ${SIDE_PANEL_COLLAPSED_WIDTH_PX}px;
        }

        .home-main-shell[data-side-panel-open='true'] {
          padding-left: min(21.8rem, 100vw);
        }

        @media (min-width: 768px) {
          .home-main-shell[data-side-panel-open='true'] {
            padding-left: min(var(--side-panel-width), calc(100vw - 5rem));
          }

          .home-main-shell[data-thread-panel-open='true'] {
            padding-right: min(var(--thread-panel-width), calc(100vw - 5rem));
          }
        }
      `}</style>
    </>
  );
}

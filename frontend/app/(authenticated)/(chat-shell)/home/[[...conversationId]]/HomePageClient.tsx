"use client";

import {
  Suspense,
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
  useTransition,
  type CSSProperties,
  type SetStateAction,
} from 'react';
import dynamic from 'next/dynamic';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  useActiveMainChatRun,
  useChatRunCoordinator,
} from '@/app/components/ChatRunCoordinator';
import {
  useHomeDataContext,
  type SelectedChat,
  type PersistentDraftChat,
  type TemporaryChatSession,
} from '@/app/home/components/HomeDataContext';
import HomeBackground from '@/app/home/components/HomeBackground';
import HomeHeader from '@/app/home/components/HomeHeader';
import ChatComposer from '@/app/home/components/ChatComposer';
import EmptyConversationState from '@/app/home/components/EmptyConversationState';
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
import {
  addThreadMetaToMap,
  removeThreadMetaFromMap,
  type PersistentThreadRuntimeRecord,
} from '@/app/home/components/persistentThreadRuntime';
import {
  type PersistentConversationTranscript,
} from '@/app/home/components/persistentConversationCache';
import { useHomeThreads } from '@/app/home/components/useHomeThreads';
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
import { usePersistedBoolean } from '@/app/home/components/usePersistedBoolean';
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
  ThreadSource,
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
import {
  THREAD_PANEL_DEFAULT_WIDTH_PX,
  clampThreadPanelWidthPx,
} from '@/app/home/components/threadPanelSizing';
import type {
  BranchSelectionMap,
  ConversationBranch,
  ConversationListItem,
  Message,
} from '@/app/home/types';
import {
  HOME_E2E_FIXTURES_ENABLED,
  isHomeE2eFixtureKey,
} from '@/app/home/homeE2eFixtureKeys';
import type { ChatImageAttachment } from '@/lib/chat-attachments';
import {
  hydrateConversationTranscript,
  type HomeConversationInitialData,
} from '@/app/home/components/homeConversationInitialData';
import type { HomeDataUnavailableReason } from '@/app/home/components/homeSidebarData';

const COMPOSER_DRAFT_INPUTS_STORAGE_KEY = 'keen-home-composer-draft-inputs-v1';
const RESPONSE_STYLE_STORAGE_KEY = 'keen-home-response-styles-v1';
const PERSISTENT_THREAD_RUNTIME_STORAGE_KEY = 'keen-persistent-thread-runtime-v1';
const THREAD_PANEL_WIDTH_STORAGE_KEY = 'keen-thread-panel-width-v1';
const CHAT_WIDE_LAYOUT_STORAGE_KEY = 'keen-home-chat-wide-layout-v1';
const TEMP_CHAT_TITLE = 'Temporary chat';
const EMPTY_PERSISTENT_MESSAGES: Message[] = [];
const EMPTY_PERSISTENT_BRANCHES: ConversationBranch[] = [];
const EMPTY_PERSISTENT_SELECTED_BRANCH_IDS: BranchSelectionMap = {};
const EMPTY_PERSISTENT_THREADS_MAP = new Map<string, ThreadMeta[]>();

const TranscriptSurface = dynamic(
  () => import('@/app/home/components/TranscriptSurface')
);
const ConversationMapSurface = dynamic(
  () => import('@/app/home/components/ConversationMapSurface'),
  { ssr: false }
);
const ThreadPanel = dynamic(
  () => import('@/app/home/components/ThreadPanel'),
  { ssr: false }
);
const HomeFixtureRuntimeLoader = HOME_E2E_FIXTURES_ENABLED
  ? dynamic(
      () => import('@/app/home/components/HomeFixtureRuntimeLoader'),
      { ssr: false }
    )
  : null;

async function removeUploadedChatImages(storagePaths: string[]) {
  if (storagePaths.length === 0) return;
  const { removeChatImageStoragePaths } = await import(
    '@/app/home/components/chatImageUploads'
  );
  await removeChatImageStoragePaths(storagePaths);
}

async function removeUploadedChatImagesBestEffort(storagePaths: string[]) {
  try {
    await removeUploadedChatImages(storagePaths);
  } catch {
    console.warn('Failed to clean up uploaded chat images.');
  }
}

function resolveStateAction<T>(action: SetStateAction<T>, current: T): T {
  return typeof action === 'function'
    ? (action as (previous: T) => T)(current)
    : action;
}

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
export default function HomePageClient({
  initialConversationData = null,
  initialConversationFailure = null,
}: {
  initialConversationData?: HomeConversationInitialData | null;
  initialConversationFailure?: HomeDataUnavailableReason | null;
}) {
  return (
    <Suspense>
      <LearningModeProvider>
        <HomePageInner
          initialConversationData={initialConversationData}
          initialConversationFailure={initialConversationFailure}
        />
      </LearningModeProvider>
    </Suspense>
  );
}

function HomePageInner({
  initialConversationData,
  initialConversationFailure,
}: {
  initialConversationData: HomeConversationInitialData | null;
  initialConversationFailure: HomeDataUnavailableReason | null;
}) {
  const [isServerRetryPending, startServerRetry] = useTransition();
  const [isMetadataRetryPending, setIsMetadataRetryPending] = useState(false);
  const chatRunCoordinator = useChatRunCoordinator();
  const { chatModels: initialChatModels } = useHomeDataContext();
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
  const [isChatWideLayout, setIsChatWideLayout] = usePersistedBoolean(
    CHAT_WIDE_LAYOUT_STORAGE_KEY,
    false
  );
  const chatModels = useChatModelCatalog(
    selectedModelId,
    setSelectedModelId,
    initialChatModels
  );
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
  const mainStyle = {
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
    upsertSidebarConversation,
    rollbackProvisionalChatPromotion,
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
    persistentConversationCache,
    clearPersistentConversationCache,
    getPersistentConversationTranscript,
    getSidebarConversation,
    loadPersistentConversationTranscript,
    setPersistentConversationTranscript,
    updatePersistentConversationTranscript,
    getTranscriptScrollPosition,
    setTranscriptScrollPosition,
    handleCreateDraftSelection,
    handleCreateTemporaryChat,
    registerPrepareForChatSwitch,
    invokePrepareForChatSwitch,
    registerCloseTempChatCleanup,
    replacePersistentConversationUrl,
    routeConversationId,
    pendingRouteConversationId,
    clearPendingRouteConversationId,
  } = useHomeDataContext();
  const selectedChatId = selectedChat?.kind === 'persistent'
    ? selectedChat.conversationId
    : selectedChat?.kind === 'temporary'
      ? selectedChat.tempChatId
      : selectedChat?.kind === 'draft'
        ? selectedChat.draftId
        : null;
  const activeMainChatRun = useActiveMainChatRun(selectedChatId);

  const updateActivePersistentConversationTranscript = useCallback(
    (
      updater: (
        transcript: PersistentConversationTranscript
      ) => PersistentConversationTranscript
    ) => {
      const activePersistentSelection = selectedChatRef.current;
      if (activePersistentSelection?.kind !== 'persistent') {
        return;
      }

      updatePersistentConversationTranscript(
        activePersistentSelection.conversationId,
        updater
      );
    },
    [selectedChatRef, updatePersistentConversationTranscript]
  );

  const setPersistentSelectedBranchIds = useCallback(
    (action: SetStateAction<BranchSelectionMap>) => {
      updateActivePersistentConversationTranscript((transcript) => ({
        ...transcript,
        selectedBranchIds: resolveStateAction(action, transcript.selectedBranchIds),
      }));
    },
    [updateActivePersistentConversationTranscript]
  );

  const upsertPersistentThreadMeta = useCallback(
    (
      conversationId: string,
      threadId: string,
      source: ThreadSource,
      previousThreadId?: string
    ) => {
      updatePersistentConversationTranscript(conversationId, (transcript) => ({
        ...transcript,
        threadsMap: addThreadMetaToMap(
          previousThreadId && previousThreadId !== threadId
            ? removeThreadMetaFromMap(transcript.threadsMap, previousThreadId)
            : transcript.threadsMap,
          threadId,
          source
        ),
      }));
    },
    [updatePersistentConversationTranscript]
  );

  const params = useParams<{ conversationId?: string[] }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const paramRouteConversationId =
    Array.isArray(params.conversationId) && params.conversationId.length > 0
      ? params.conversationId[0]
      : null;
  const effectiveRouteConversationId =
    pendingRouteConversationId && paramRouteConversationId !== pendingRouteConversationId
      ? pendingRouteConversationId
      : paramRouteConversationId ?? routeConversationId;
  const activeRouteConversationIdRef = useRef(effectiveRouteConversationId);
  const metadataRetryRequestIdRef = useRef(0);
  activeRouteConversationIdRef.current = effectiveRouteConversationId;
  useEffect(() => {
    metadataRetryRequestIdRef.current += 1;
    setIsMetadataRetryPending(false);
  }, [effectiveRouteConversationId]);
  const e2eFixtureQuery = searchParams.get('e2e');
  const e2eFixtureKey = isHomeE2eFixtureKey(e2eFixtureQuery)
    ? e2eFixtureQuery
    : null;
  const isHomeE2eFixture = e2eFixtureKey !== null;
  const initialTranscript = useMemo(
    () =>
      initialConversationData
        ? hydrateConversationTranscript(initialConversationData.transcript)
        : null,
    [initialConversationData]
  );
  const initialDataMatchesRoute =
    initialConversationData?.conversation.id === effectiveRouteConversationId;
  const conversationCatalog = useMemo(
    () =>
      initialConversationData
      && !conversations.some(
        (conversation) =>
          conversation.id === initialConversationData.conversation.id
      )
        ? [initialConversationData.conversation, ...conversations]
        : conversations,
    [conversations, initialConversationData]
  );

  useEffect(() => {
    if (!initialConversationData || !initialTranscript) return;
    const conversationId = initialConversationData.conversation.id;
    if (!getPersistentConversationTranscript(conversationId)) {
      setPersistentConversationTranscript(conversationId, initialTranscript);
    }
    if (!conversations.some((conversation) => conversation.id === conversationId)) {
      upsertSidebarConversation({
        id: conversationId,
        title: initialConversationData.conversation.title,
        mentorId: initialConversationData.conversation.mentor_id,
        workspaceId: initialConversationData.conversation.workspace_id,
        createdAt: initialConversationData.conversation.created_at,
        updatedAt: initialConversationData.conversation.updated_at,
      });
    }
  }, [
    conversations,
    getPersistentConversationTranscript,
    initialConversationData,
    initialTranscript,
    setPersistentConversationTranscript,
    upsertSidebarConversation,
  ]);

  useEffect(() => {
    if (
      pendingRouteConversationId &&
      paramRouteConversationId === pendingRouteConversationId
    ) {
      clearPendingRouteConversationId();
    }
  }, [
    clearPendingRouteConversationId,
    paramRouteConversationId,
    pendingRouteConversationId,
  ]);

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
    threadSessionsRef,
    resetThreadUi,
    dismissPopover,
    handlePointerUp,
    createThreadSession,
    updateThreadSession,
    activateThreadSession,
    closeThreadPanel,
    findThreadSessionId,
  } = useHomeThreads(learningMode, containerRef);
  const [hasOpenedThreadPanel, setHasOpenedThreadPanel] = useState(false);
  useEffect(() => {
    if (threadPanelOpen) {
      setHasOpenedThreadPanel(true);
    }
  }, [threadPanelOpen]);
  const selectedChatKey = getSelectedChatKey(selectedChat);
  const activePersistentConversationId =
    selectedChat?.kind === 'persistent' ? selectedChat.conversationId : null;
  const activePersistentTranscript = activePersistentConversationId
    ? persistentConversationCache[activePersistentConversationId]
      ?? (
        initialDataMatchesRoute
        && initialConversationData?.conversation.id === activePersistentConversationId
          ? initialTranscript
          : null
      )
    : null;
  const persistentMessages =
    activePersistentTranscript?.messages ?? EMPTY_PERSISTENT_MESSAGES;
  const persistentBranches =
    activePersistentTranscript?.branches ?? EMPTY_PERSISTENT_BRANCHES;
  const persistentSelectedBranchIds =
    activePersistentTranscript?.selectedBranchIds ?? EMPTY_PERSISTENT_SELECTED_BRANCH_IDS;
  const persistentThreadsMap =
    activePersistentTranscript?.threadsMap ?? EMPTY_PERSISTENT_THREADS_MAP;
  const hasEffectiveRouteConversationTranscript =
    effectiveRouteConversationId !== null
    && (
      persistentConversationCache[effectiveRouteConversationId] !== undefined
      || initialDataMatchesRoute
    );
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
    isLoading: hasPendingChatRequest,
    pendingChatRequestsRef,
    clearPendingRequest: clearPendingChatRequestForSelection,
    movePendingRequest: movePendingChatRequestBetweenSelections,
    resetPendingRequests,
    setPendingPhase: setPendingChatRequestPhaseForSelection,
    setPendingRequest: setPendingChatRequestForSelection,
  } = usePendingChatRequests(selectedChat);
  const isLoading = hasPendingChatRequest || activeMainChatRun !== null;
  const {
    activeConversationBranches,
    activeConversationId,
    activeConversationMessages,
    activeMessages,
    activeSelectedBranchIds,
    activeThreadMarkersMap,
    branchChipsByMessageId,
    conversationTitle,
    emptySubtitle,
    emptyTitle,
    isActiveConversationLoading,
    isTemporaryChat,
    selectedDraftChat,
    selectedTemporaryChat,
  } = useActiveConversationModel({
    activePendingRequest: activePendingChatRequest,
    conversations: conversationCatalog,
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
  const hasConversationMap = activeConversationMessages.length > 0;
  const {
    endProgrammaticTranscriptNavigation,
    handleScroll,
    jumpToMessage,
    saveCurrentScrollPosition,
    setUserHasScrolledState,
  } = useTranscriptNavigation({
    activeMessages,
    containerRef,
    currentMapMessageId,
    getSavedScrollPosition: getTranscriptScrollPosition,
    messagesEndRef,
    scrollRestorationKey: selectedChatKey,
    setSavedScrollPosition: setTranscriptScrollPosition,
    setCurrentMapMessageId,
  });

  const mentorSlugHandledRef = useRef(false);
  const selectedDraftChatRef = useRef<PersistentDraftChat | null>(null);
  const persistentThreadRuntimesRef = useRef<PersistentThreadRuntimeRecord>({});
  const temporaryChatsRef = useRef<TemporaryChatSession[]>([]);
  useEffect(() => {
    // Thread handlers read these latest values from callbacks.
    persistentThreadRuntimesRef.current = persistentThreadRuntimes;
    temporaryChatsRef.current = temporaryChats;
  }, [
    persistentThreadRuntimes,
    temporaryChats,
  ]);
  const {
    hydratedRouteConversationId,
    hydratedRouteConversationIdRef,
    routeConversationError,
    retryRouteConversation,
    shouldShowRouteConversationError,
    shouldShowRouteConversationLoading,
  } = useRouteConversationHydration({
    activeMessagesLength: activeMessages.length,
    conversations: conversationCatalog,
    deferRouteConversationLoad: pendingRouteConversationId !== null,
    effectiveRouteConversationId,
    getPersistentConversationTranscript,
    hasRouteConversationTranscript: hasEffectiveRouteConversationTranscript,
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
    initialRouteConversationError:
      initialConversationFailure === 'timeout'
        ? 'The conversation took too long to load.'
        : initialConversationFailure === 'error'
          ? 'The conversation could not be loaded.'
          : null,
  });

  const transcriptMetadataError = useMemo(() => {
    const status = activePersistentTranscript?.metadataStatus;
    if (!status) return null;
    const unavailable = (
      [
        ['branches', status.branches],
        ['threads', status.threads],
        ['attachments', status.attachments],
      ] as const
    )
      .filter(([, resourceStatus]) => resourceStatus.status === 'unavailable')
      .map(([resource]) => resource);
    if (unavailable.length === 0) return null;
    return `Some conversation details could not be loaded (${unavailable.join(', ')}).`;
  }, [activePersistentTranscript]);

  const retryConversationLoad = useCallback(() => {
    if (initialConversationFailure) {
      startServerRetry(() => {
        router.refresh();
      });
      return;
    }
    if (transcriptMetadataError && effectiveRouteConversationId) {
      const conversationId = effectiveRouteConversationId;
      const requestId = metadataRetryRequestIdRef.current + 1;
      metadataRetryRequestIdRef.current = requestId;
      const isCurrentRetry = () =>
        metadataRetryRequestIdRef.current === requestId
        && activeRouteConversationIdRef.current === conversationId;
      setIsMetadataRetryPending(true);
      setListError(null);
      void loadPersistentConversationTranscript(
        conversationId,
        () => loadConversationMessages(conversationId),
        { force: true }
      )
        .then(() => {
          if (isCurrentRetry()) setListError(null);
        })
        .catch(() => {
          if (isCurrentRetry()) {
            setListError('Conversation details still could not be loaded.');
          }
        })
        .finally(() => {
          if (isCurrentRetry()) setIsMetadataRetryPending(false);
        });
      return;
    }
    retryRouteConversation();
  }, [
    effectiveRouteConversationId,
    initialConversationFailure,
    loadConversationMessages,
    loadPersistentConversationTranscript,
    retryRouteConversation,
    router,
    setListError,
    startServerRetry,
    transcriptMetadataError,
  ]);
  const visibleDataError =
    shouldShowRouteConversationError
      ? null
      : transcriptMetadataError ?? listError;

  useEffect(() => {
    if (selectedChat?.kind === 'draft' && !selectedDraftChat) {
      setSelectedChat(null);
    }
  }, [selectedChat, selectedDraftChat, setSelectedChat]);

  useEffect(() => {
    if (selectedChat?.kind === 'temporary' && !selectedTemporaryChat) {
      setSelectedChat(null);
    }
  }, [selectedChat, selectedTemporaryChat, setSelectedChat]);

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
    handleCreateDraftSelection,
  ]);

  const cleanupTemporaryChatAttachments = useCallback((tempChatId: string) => {
    const storagePaths = getTemporaryChatAttachmentStoragePaths(
      temporaryChatsRef.current,
      tempChatId
    );

    if (storagePaths.length > 0) {
      void removeUploadedChatImagesBestEffort(storagePaths);
    }
    void chatRunCoordinator.closeTemporaryChat(tempChatId);
  }, [chatRunCoordinator]);

  const previousSelectedChatKeyRef = useRef<string | null>(selectedChatKey);
  useEffect(() => {
    if (previousSelectedChatKeyRef.current === selectedChatKey) {
      return;
    }

    previousSelectedChatKeyRef.current = selectedChatKey;
    clearPendingImageAttachments();
  }, [clearPendingImageAttachments, selectedChatKey]);

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
    saveCurrentScrollPosition,
    selectedChatRef,
    selectedDraftChat,
    selectedDraftChatRef,
    setConversationMapOpen,
    setDraftChats,
    setPendingBranch,
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
    activateThreadSession,
    createThreadSession,
    findThreadSessionId,
    persistentThreadRuntimes,
    persistentThreadRuntimesRef,
    selectedChat,
    selectedModelId,
    selectedModelEffort: selectedModelEffortOverride,
    thinkingEnabled: thinkingEnabledOverride,
    responseStyle: activeResponseStyle,
    searchMode: activeSearchMode,
    selectedTemporaryChat,
    setPersistentThreadRuntimes,
    upsertPersistentThreadMeta,
    storageKey: PERSISTENT_THREAD_RUNTIME_STORAGE_KEY,
    threadSessionsRef,
    updateTemporaryChat,
    updateThreadSession,
  });

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
    hydratedRouteConversationId,
    hydratedRouteConversationIdRef,
    getPersistentConversationTranscript,
    getSidebarConversation,
    loadConversationMessages,
    movePendingChatRequestBetweenSelections,
    moveResponseStyleBetweenSelections,
    moveSearchModeBetweenSelections,
    pendingBranch,
    pendingChatRequestsRef,
    persistentBranches,
    persistentMessages,
    persistentSelectedBranchIds,
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
    setPersistentConversationTranscript,
    updatePersistentConversationTranscript,
    replacePersistentConversationUrl,
    rollbackProvisionalChatPromotion,
    setComposerInputForSelection,
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
        void removeUploadedChatImagesBestEffort(
          result.cleanupUploadedAttachments.map(
            (attachment) => attachment.storagePath
          )
        );
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
    if (activeMainChatRun) {
      return;
    }
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
        prepareUploadedAttachments: async () => {
          const { uploadChatImageAttachments } = await import(
            '@/app/home/components/chatImageUploads'
          );
          return uploadChatImageAttachments(imagesToSend);
        },
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
        await removeUploadedChatImages(
          result.cleanupUploadedAttachments.map(
            (attachment) => attachment.storagePath
          )
        );
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
      {HomeFixtureRuntimeLoader && e2eFixtureKey && (
        <HomeFixtureRuntimeLoader
          fixtureKey={e2eFixtureKey}
          composerDraftInputsStorageKey={COMPOSER_DRAFT_INPUTS_STORAGE_KEY}
          endProgrammaticTranscriptNavigation={
            endProgrammaticTranscriptNavigation
          }
          resetAllComposerState={resetAllComposerState}
          resetPendingRequests={resetPendingRequests}
          resetThreadUi={resetThreadUi}
          clearPersistentConversationCache={clearPersistentConversationCache}
          setDraftChats={setDraftChats}
          setListError={setListError}
          setPendingBranch={setPendingBranch}
          setPersistentConversationTranscript={
            setPersistentConversationTranscript
          }
          setSelectedChat={setSelectedChat}
          setTemporaryChats={setTemporaryChats}
          setUserHasScrolledState={setUserHasScrolledState}
          tempChatTitle={TEMP_CHAT_TITLE}
        />
      )}
      <HomeBackground />

      <main
        data-thread-panel-open={threadPanelOpen}
        className="home-main-shell side-panel-content relative flex min-h-0 flex-1 flex-col transition-[padding] duration-300 ease-out"
        style={mainStyle}
      >
        <div className="w-full shrink-0 px-6">
          <HomeHeader
            conversationTitle={conversationTitle}
            isTemporaryChat={isTemporaryChat}
            loadingLists={loadingLists}
            onCreateTemporaryChat={handleCreateTemporaryChat}
            conversationMapNodeCount={activeConversationMessages.length}
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
              data-home-region="transcript"
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
              {activeMessages.length === 0 ? (
                <EmptyConversationState
                  emptyTitle={emptyTitle}
                  emptySubtitle={emptySubtitle}
                  listError={visibleDataError}
                  routeConversationError={routeConversationError}
                  isRouteConversationLoading={
                    shouldShowRouteConversationLoading
                  }
                  retrying={isServerRetryPending || isMetadataRetryPending}
                  onRetry={
                    routeConversationError || transcriptMetadataError
                      ? retryConversationLoad
                      : undefined
                  }
                />
              ) : (
                <TranscriptSurface
                  activeHighlightSource={highlightSource}
                  isWideLayout={isChatWideLayout}
                  listError={visibleDataError}
                  retrying={isServerRetryPending || isMetadataRetryPending}
                  onRetry={
                    transcriptMetadataError
                      ? retryConversationLoad
                      : undefined
                  }
                  messages={activeMessages}
                  isLoading={isActiveConversationLoading}
                  threadsMap={activeThreadMarkersMap}
                  branchChipsByMessageId={branchChipsByMessageId}
                  pendingBranchSourceMessageId={
                    pendingBranch?.sourceMessageId ?? null
                  }
                  messagesEndRef={messagesEndRef}
                  onThreadClick={handleThreadMarkerClick}
                  onSelectBranch={handleSelectBranch}
                  onCreateBranch={handleCreateBranch}
                  onAssistantPointerUp={handlePointerUp}
                  popoverState={popoverState}
                  onDismissPopover={dismissPopover}
                  onSubmitThreadQuestion={submitThreadQuestion}
                  onOpenThreadDraft={openThreadDraft}
                />
              )}
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
                  <ConversationMapSurface
                    messages={activeConversationMessages}
                    branches={activeConversationBranches}
                    selectedBranchIds={activeSelectedBranchIds}
                    pendingBranchSourceMessageId={
                      pendingBranch?.sourceMessageId ?? null
                    }
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
          isWideLayout={isChatWideLayout}
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
          onToggleWideLayout={() => setIsChatWideLayout((current) => !current)}
          onSubmit={handleSubmit}
          onStop={() => {
            if (activeMainChatRun) {
              void chatRunCoordinator.stop(activeMainChatRun.runId);
            }
          }}
          onKeyDown={handleKeyDown}
        />

        {conversationMapOpen && hasConversationMap && !isDesktopViewport && (
          <div className="fixed inset-0 z-50 bg-background/92 p-3 backdrop-blur-sm lg:hidden">
            <ConversationMapSurface
              messages={activeConversationMessages}
              branches={activeConversationBranches}
              selectedBranchIds={activeSelectedBranchIds}
              pendingBranchSourceMessageId={
                pendingBranch?.sourceMessageId ?? null
              }
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

      {(threadPanelOpen || hasOpenedThreadPanel) && (
        <ThreadPanel
          isOpen={threadPanelOpen}
          widthPx={threadPanelWidthPx}
          session={activeSession}
          temporaryChatEnabled={isTemporaryChat}
          suspendCloseShortcut={Boolean(popoverState)}
          onWidthChange={setThreadPanelWidthPx}
          onInputChange={handleThreadPanelInputChange}
          onSend={handleSendThreadMessage}
          onStop={() => {
            if (!activeSession?.threadId) return;
            const chatId = selectedChat?.kind === 'persistent'
              ? selectedChat.conversationId
              : selectedChat?.kind === 'temporary'
                ? selectedChat.tempChatId
                : selectedChat?.kind === 'draft'
                  ? selectedChat.draftId
                : null;
            if (!chatId) return;
            const run = chatRunCoordinator.getSnapshotsForChat(chatId)
              .find((candidate) =>
                candidate.target.threadId === activeSession.threadId
                && !['completed', 'failed', 'cancelled'].includes(candidate.status)
              );
            if (run) void chatRunCoordinator.stop(run.runId);
          }}
          onClose={closeThreadPanel}
        />
      )}

      <style jsx>{`
        @media (min-width: 768px) {
          .home-main-shell[data-thread-panel-open='true'] {
            padding-right: min(var(--thread-panel-width), calc(100vw - 5rem));
          }
        }
      `}</style>
    </>
  );
}

"use client";

import { Suspense, useState, useCallback, useRef, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useSidePanel } from '@/app/home/components/SidePanelContext';
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
  createPendingChatImageAttachments,
  uploadChatImageAttachments,
  type PendingChatImageAttachment,
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
import { useHomeVoice } from '@/app/home/components/useHomeVoice';
import { useActiveConversationModel } from '@/app/home/components/useActiveConversationModel';
import { usePendingChatRequests } from '@/app/home/components/usePendingChatRequests';
import { usePerChatComposerState } from '@/app/home/components/usePerChatComposerState';
import { usePersistedJson } from '@/app/home/components/usePersistedJson';
import { usePersistedString } from '@/app/home/components/usePersistedString';
import { useRouteConversationHydration } from '@/app/home/components/useRouteConversationHydration';
import { useTranscriptNavigation } from '@/app/home/components/useTranscriptNavigation';
import { useVoiceAutoSend } from '@/app/home/components/useVoiceAutoSend';
import type {
  ThreadMeta,
  ThreadSession,
} from '@/app/home/components/threadTypes';
import {
  DEFAULT_CHAT_MODEL_ID,
  isChatModelId,
  isChatModelEffortLevel,
  type ChatModelEffortOverrides,
  type ChatModelEffortLevel,
  type ChatModelId,
  type ChatModelThinkingOverrides,
} from '@/lib/chat-models';
import { LearningModeProvider, useLearningMode } from '@/app/home/components/LearningModeContext';
import TextSelectionPopover from '@/app/home/components/TextSelectionPopover';
import ThreadPanel from '@/app/home/components/ThreadPanel';
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

const TTS_STORAGE_KEY = 'keen-tts-enabled';
const CHAT_MODEL_STORAGE_KEY = 'keen-chat-model';
const CHAT_MODEL_EFFORT_OVERRIDES_STORAGE_KEY = 'keen-chat-model-effort-overrides-v1';
const CHAT_MODEL_THINKING_OVERRIDES_STORAGE_KEY = 'keen-chat-thinking-overrides-v1';
const COMPOSER_DRAFT_INPUTS_STORAGE_KEY = 'keen-home-composer-draft-inputs-v1';
const RESPONSE_STYLE_STORAGE_KEY = 'keen-home-response-styles-v1';
const PERSISTENT_THREAD_RUNTIME_STORAGE_KEY = 'keen-persistent-thread-runtime-v1';
const TEMP_CHAT_TITLE = 'Temporary chat';

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isChatModelEffortOverrides(value: unknown): value is ChatModelEffortOverrides {
  if (!isPlainRecord(value)) {
    return false;
  }

  return Object.entries(value).every(
    ([modelId, effort]) =>
      isChatModelId(modelId)
      && typeof effort === 'string'
      && isChatModelEffortLevel(effort)
  );
}

function isChatModelThinkingOverrides(value: unknown): value is ChatModelThinkingOverrides {
  if (!isPlainRecord(value)) {
    return false;
  }

  return Object.entries(value).every(
    ([modelId, enabled]) =>
      isChatModelId(modelId) && typeof enabled === 'boolean'
  );
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
 * Home page - editorial voice + text conversation interface
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
  const [searchEnabled, setSearchEnabled] = useState(false);
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
  const selectedModelSupportsImages = selectedChatModel?.supportsImages ?? true;
  const selectedModelRejectsGifImages = selectedChatModel?.provider === 'google';
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
  const [pendingImageAttachments, setPendingImageAttachments] = useState<
    PendingChatImageAttachment[]
  >([]);
  const [isUploadingImages, setIsUploadingImages] = useState(false);
  const [imageWarning, setImageWarning] = useState<string | null>(null);
  const [currentMapMessageId, setCurrentMapMessageId] = useState<string | null>(null);
  const [isDesktopViewport, setIsDesktopViewport] = useState(false);

  const { learningMode } = useLearningMode();
  const { isOpen: sidePanelOpen } = useSidePanel();

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

  const {
    micActive,
    ttsEnabled,
    tts,
    microphone,
    transcription,
    visualization,
    startMic,
    stopMic: stopVoiceCapture,
    toggleTtsEnabled,
  } = useHomeVoice(TTS_STORAGE_KEY);
  // Voice controls are hidden for now; keep the underlying wiring dormant until the feature is revisited.
  const voiceControlsEnabled = false;
  const voiceOutputEnabled = voiceControlsEnabled && ttsEnabled;
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const splitPaneRef = useRef<HTMLDivElement>(null);
  const {
    popoverState,
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
    composerDraftInputsRef,
    input,
    clearInputForSelection: clearComposerInputForSelection,
    clearResponseStyleForSelection,
    clearSearchStateForSelection,
    moveResponseStyleBetweenSelections,
    resetAllComposerState,
    setInputForSelection: setComposerInputForSelection,
    setResponseStyleForSelection,
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

  const autoSendTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mentorSlugHandledRef = useRef(false);
  const selectedDraftChatRef = useRef<PersistentDraftChat | null>(null);
  const persistentSelectedBranchIdsRef = useRef<BranchSelectionMap>({});
  const persistentThreadRuntimesRef = useRef<PersistentThreadRuntimeRecord>({});
  const temporaryChatsRef = useRef<TemporaryChatSession[]>([]);
  const pendingImageAttachmentsRef = useRef<PendingChatImageAttachment[]>([]);
  const threadSessionsRef = useRef<Record<string, ThreadSession>>({});

  useEffect(() => {
    // Draft promotion and branch/thread handlers read these latest values from callbacks.
    persistentSelectedBranchIdsRef.current = persistentSelectedBranchIds;
    persistentThreadRuntimesRef.current = persistentThreadRuntimes;
    temporaryChatsRef.current = temporaryChats;
    pendingImageAttachmentsRef.current = pendingImageAttachments;
    threadSessionsRef.current = threadSessionsById;
  }, [
    pendingImageAttachments,
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

  const stopMic = useCallback(() => {
    if (autoSendTimerRef.current) {
      clearTimeout(autoSendTimerRef.current);
      autoSendTimerRef.current = null;
    }
    stopVoiceCapture();
  }, [stopVoiceCapture]);

  const toggleMic = useCallback(() => {
    if (micActive) {
      stopMic();
    } else {
      void startMic();
    }
  }, [micActive, startMic, stopMic]);

  const clearPendingImageAttachments = useCallback(() => {
    setPendingImageAttachments((current) => {
      for (const attachment of current) {
        URL.revokeObjectURL(attachment.url);
      }

      return [];
    });
    setImageWarning(null);
  }, []);

  const cleanupTemporaryChatAttachments = useCallback((tempChatId: string) => {
    const storagePaths = getTemporaryChatAttachmentStoragePaths(
      temporaryChatsRef.current,
      tempChatId
    );

    if (storagePaths.length > 0) {
      void supabase.storage.from(CHAT_IMAGE_BUCKET).remove(storagePaths);
    }
  }, []);

  useEffect(() => {
    return () => {
      for (const attachment of pendingImageAttachmentsRef.current) {
        URL.revokeObjectURL(attachment.url);
      }
    };
  }, []);

  const previousSelectedChatKeyRef = useRef<string | null>(selectedChatKey);
  useEffect(() => {
    if (previousSelectedChatKeyRef.current === selectedChatKey) {
      return;
    }

    previousSelectedChatKeyRef.current = selectedChatKey;
    clearPendingImageAttachments();
  }, [clearPendingImageAttachments, selectedChatKey]);

  const handleAttachImages = useCallback(async (files: File[]) => {
    if (files.length === 0) {
      return;
    }

    if (!selectedModelSupportsImages) {
      setImageWarning('The selected model cannot read images. Choose a vision-capable model.');
      return;
    }

    if (
      selectedModelRejectsGifImages
      && files.some((file) => file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif'))
    ) {
      setImageWarning('Google models do not support GIF images here. Use PNG, JPEG, or WebP.');
      return;
    }

    if (isUploadingImages) {
      setImageWarning('Wait for the current image upload to finish.');
      return;
    }

    const result = await createPendingChatImageAttachments(
      files,
      pendingImageAttachments.length
    );

    if (result.attachments.length > 0) {
      setPendingImageAttachments((current) => [...current, ...result.attachments]);
    }

    setImageWarning(result.error);
  }, [
    isUploadingImages,
    pendingImageAttachments.length,
    selectedModelRejectsGifImages,
    selectedModelSupportsImages,
  ]);

  const handleRemoveImageAttachment = useCallback((id: string) => {
    setPendingImageAttachments((current) => {
      const attachment = current.find((item) => item.id === id);
      if (attachment) {
        URL.revokeObjectURL(attachment.url);
      }

      return current.filter((item) => item.id !== id);
    });
    setImageWarning(null);
  }, []);

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
    stopMic,
    tempChatTitle: TEMP_CHAT_TITLE,
    tts,
  });

  useHomeChatSwitchLifecycle({
    clearComposerInputForSelection,
    clearPendingChatRequestForSelection,
    clearResponseStyleForSelection,
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
    stopMic,
    tts,
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
    autoSendTimerRef,
    clearComposerInputForSelection,
    clearPendingChatRequestForSelection,
    clearSearchStateForSelection,
    getOrCreateDraft,
    hydratedRouteConversationIdRef,
    isHomeE2eFixture,
    loadConversationMessages,
    movePendingChatRequestBetweenSelections,
    moveResponseStyleBetweenSelections,
    pendingBranch,
    pendingChatRequestsRef,
    persistentBranches,
    persistentMessages,
    persistentSelectedBranchIds,
    persistentSelectedBranchIdsRef,
    refreshSidebarData,
    responseStyle: activeResponseStyle,
    searchEnabled,
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
    transcription,
    tts,
    ttsEnabled: voiceOutputEnabled,
    updateDraftChat,
    updateTemporaryChat,
  });

  useVoiceAutoSend({
    autoSendTimerRef,
    finalTranscript: transcription.finalTranscript,
    interimTranscript: transcription.interimTranscript,
    isLoading,
    micActive,
    sendMessage,
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
    setSearchEnabled(handoff.searchEnabled);
    setResponseStyleForSelection(selectedChat, handoff.responseStyle);

    void sendMessage(handoff.message, {
      modelId: handoff.modelId,
      modelEffort: handoff.modelEffort,
      thinkingEnabled: handoff.thinkingEnabled,
      responseStyle: handoff.responseStyle,
      searchEnabled: handoff.searchEnabled,
    }).then((result) => {
      if (!result.accepted && result.error) {
        setImageWarning(result.error);
      }
    });
  }, [
    selectedChat,
    sendMessage,
    setModelEffortOverrides,
    setResponseStyleForSelection,
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
      setImageWarning('The selected model cannot read images. Choose a vision-capable model.');
      return;
    }

    if (
      selectedModelRejectsGifImages
      && imagesToSend.some((attachment) => attachment.mimeType === 'image/gif')
    ) {
      setImageWarning('Google models do not support GIF images here. Use PNG, JPEG, or WebP.');
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
        className={`relative flex min-h-0 flex-1 flex-col transition-[padding] duration-300 ease-out ${
          sidePanelOpen ? 'pl-[min(21.8rem,100vw)]' : 'pl-14'
        } ${threadPanelOpen ? 'lg:pr-[460px]' : ''}`}
      >
        <div className="w-full shrink-0 px-6">
          <HomeHeader
            activeName={activeName}
            isTemporaryChat={isTemporaryChat}
            temporaryMemoryMode={activeTemporaryMemoryMode}
            loadingLists={loadingLists}
            onBrowseMentors={() => router.push('/mentors')}
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
          imageInputDisabled={!selectedModelSupportsImages}
          isUploadingImages={isUploadingImages}
          micActive={micActive}
          pendingImageAttachments={pendingImageAttachments}
          responseStyle={activeResponseStyle}
          selectedModelId={selectedModelId}
          modelEffortOverrides={modelEffortOverrides}
          thinkingEnabledOverrides={thinkingEnabledOverrides}
          ttsEnabled={voiceOutputEnabled}
          searchEnabled={searchEnabled}
          temporaryChatEnabled={isTemporaryChat}
          showTemporaryIntro={isTemporaryChat && activeMessages.length === 0}
          temporaryMemoryMode={activeTemporaryMemoryMode}
          finalTranscript={transcription.finalTranscript}
          interimTranscript={transcription.interimTranscript}
          transcriptionStatus={transcription.status}
          microphoneStatus={microphone.status}
          microphoneErrorMessage={microphone.errorMessage}
          searchWarning={activeSearchState?.warning ?? null}
          imageWarning={imageWarning}
          isTtsLoading={tts.isLoading}
          isTtsPlaying={tts.isPlaying}
          textareaRef={textareaRef}
          waveformRef={visualization.lineRef}
          waveformGlowRef={visualization.glowRef}
          waveformContainerRef={visualization.visualRef}
          onInputChange={(value) => setComposerInputForSelection(composerStateSelection, value)}
          onAttachImages={handleAttachImages}
          onRemoveImageAttachment={handleRemoveImageAttachment}
          onModelChange={setSelectedModelId}
          onModelEffortChange={updateSelectedModelEffort}
          onThinkingEnabledChange={updateThinkingEnabled}
          onResponseStyleChange={(value) =>
            setResponseStyleForSelection(composerStateSelection, value)
          }
          onToggleMic={toggleMic}
          onToggleTts={toggleTtsEnabled}
          onToggleSearch={() => setSearchEnabled((prev) => !prev)}
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
        session={activeSession}
        temporaryChatEnabled={isTemporaryChat}
        suspendCloseShortcut={Boolean(popoverState)}
        onInputChange={handleThreadPanelInputChange}
        onSend={handleSendThreadMessage}
        onClose={closeThreadPanel}
      />
    </>
  );
}

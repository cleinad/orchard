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
import ConversationMap from '@/app/home/components/ConversationMap';
import ConversationView from '@/app/home/components/ConversationView';
import {
  buildConversationMapModel,
  getMapNavigationAnchorMessageId,
  getRouteSelectionPatch,
} from '@/app/home/components/conversationMapModel';
import {
  createPendingBranchTarget,
  getActivePathMessages,
  getBranchChipsForMessage,
  type PendingBranchTarget,
} from '@/app/home/components/conversationTree';
import { logResolvedChatModel } from '@/app/home/components/logResolvedChatModel';
import {
  readChatStream,
  useMainChatRuntime,
  type ChatResponse,
} from '@/app/home/components/useMainChatRuntime';
import { useHomeThreads } from '@/app/home/components/useHomeThreads';
import { useConversationMapState } from '@/app/home/components/useConversationMapState';
import { useHomeVoice } from '@/app/home/components/useHomeVoice';
import { usePersistedString } from '@/app/home/components/usePersistedString';
import type {
  InlineThreadMarker,
  ThreadMessage,
  ThreadMeta,
  ThreadSession,
  ThreadSessionStatus,
  ThreadSource,
} from '@/app/home/components/threadTypes';
import type { SearchMetadata } from '@/lib/chat-search';
import {
  CHAT_MODEL_OPTIONS,
  DEFAULT_CHAT_MODEL_ID,
  isChatModelId,
  type ChatModelId,
  type ChatModelListItem,
} from '@/lib/chat-models';
import type { MentorListItem } from '@/lib/mentors/types';
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
import {
  createTemporaryId,
  DEFAULT_TEMPORARY_MEMORY_MODE,
  toChatHistory,
  type ChatMode,
  type TemporaryMemoryMode,
} from '@/lib/chat-session';
import { getBrowserTimeZone } from '@/lib/browser-timezone';

interface ChatModelsResponse {
  models?: ChatModelListItem[];
  error?: string;
}

const MAP_SCROLL_TOP_OFFSET = 104;
const TRANSCRIPT_NAVIGATION_LOCK_MS = 700;
const JUMP_TO_MESSAGE_MAX_ATTEMPTS = 8;
interface PendingChatRequest {
  selection: SelectedChat;
  userMessageId: string;
  phase: 'awaiting-response' | 'reconciling';
}

type ThreadMetaRecord = Record<string, ThreadMeta[]>;
type ThreadMessagesRecord = Record<string, ThreadMessage[]>;
type ThreadStatusRecord = Record<string, ThreadSessionStatus>;

interface PersistentThreadRuntime {
  threadsMap: ThreadMetaRecord;
  threadMessages: ThreadMessagesRecord;
  threadStatuses: ThreadStatusRecord;
}

interface StoredMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  searchMetadata?: Message['searchMetadata'];
  previousMessageId: string | null;
}

interface StoredThreadMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  searchMetadata?: ThreadMessage['searchMetadata'];
}

interface StoredPersistentThreadRuntime {
  threadsMap: ThreadMetaRecord;
  threadMessages: Record<string, StoredThreadMessage[]>;
  threadStatuses: ThreadStatusRecord;
}

type PersistentThreadRuntimeRecord = Record<string, PersistentThreadRuntime>;
type StoredPersistentThreadRuntimeRecord = Record<string, StoredPersistentThreadRuntime>;

function getSelectedChatKey(selection: SelectedChat | null) {
  if (!selection) {
    return null;
  }

  if (selection.kind === 'persistent') {
    return `persistent:${selection.conversationId}`;
  }

  if (selection.kind === 'draft') {
    return `draft:${selection.draftId}`;
  }

  return `temporary:${selection.tempChatId}`;
}

const BLANK_COMPOSER_KEY = 'blank:keen';

function getComposerStateKey(selection: SelectedChat | null) {
  return getSelectedChatKey(selection) ?? BLANK_COMPOSER_KEY;
}

function deleteRecordKey<T>(record: Record<string, T>, key: string) {
  if (!(key in record)) {
    return record;
  }

  const next = { ...record };
  delete next[key];
  return next;
}

const TTS_STORAGE_KEY = 'keen-tts-enabled';
const CHAT_MODEL_STORAGE_KEY = 'keen-chat-model';
const COMPOSER_DRAFT_INPUTS_STORAGE_KEY = 'keen-home-composer-draft-inputs-v1';
const PERSISTENT_THREAD_RUNTIME_STORAGE_KEY = 'keen-persistent-thread-runtime-v1';
const TEMP_CHAT_TITLE = 'Temporary chat';

function getMentorKey(mentorId: string | null) {
  return mentorId ?? '__keen__';
}

function toStoredMessage(message: Message): StoredMessage {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    timestamp: message.timestamp.toISOString(),
    searchMetadata: message.searchMetadata ?? null,
    previousMessageId: message.previousMessageId,
  };
}

function fromStoredMessage(message: StoredMessage): Message {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    timestamp: new Date(message.timestamp),
    searchMetadata: message.searchMetadata ?? null,
    previousMessageId: message.previousMessageId ?? null,
  };
}

function toStoredThreadMessage(message: ThreadMessage): StoredThreadMessage {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    timestamp: message.timestamp.toISOString(),
    searchMetadata: message.searchMetadata ?? null,
  };
}

function fromStoredThreadMessage(message: StoredThreadMessage): ThreadMessage {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    timestamp: new Date(message.timestamp),
    searchMetadata: message.searchMetadata ?? null,
  };
}

function createEmptyPersistentThreadRuntime(): PersistentThreadRuntime {
  return {
    threadsMap: {},
    threadMessages: {},
    threadStatuses: {},
  };
}

function serializePersistentThreadRuntimes(runtimes: PersistentThreadRuntimeRecord) {
  const serialized: StoredPersistentThreadRuntimeRecord = Object.fromEntries(
    Object.entries(runtimes).map(([conversationId, runtime]) => [
      conversationId,
      {
        threadsMap: runtime.threadsMap,
        threadStatuses: runtime.threadStatuses,
        threadMessages: Object.fromEntries(
          Object.entries(runtime.threadMessages).map(([threadId, messages]) => [
            threadId,
            messages.map(toStoredThreadMessage),
          ])
        ),
      },
    ])
  );

  return JSON.stringify(serialized);
}

function deserializePersistentThreadRuntimes(raw: string): PersistentThreadRuntimeRecord {
  const parsed = JSON.parse(raw) as StoredPersistentThreadRuntimeRecord;

  return Object.fromEntries(
    Object.entries(parsed).map(([conversationId, runtime]) => [
      conversationId,
      {
        threadsMap: runtime.threadsMap || {},
        threadStatuses: runtime.threadStatuses || {},
        threadMessages: Object.fromEntries(
          Object.entries(runtime.threadMessages || {}).map(([threadId, messages]) => [
            threadId,
            messages.map(fromStoredThreadMessage),
          ])
        ),
      },
    ])
  );
}

function recordToThreadsMap(record: ThreadMetaRecord | undefined) {
  return new Map<string, ThreadMeta[]>(Object.entries(record || {}));
}

function mergeThreadsMaps(...maps: Array<Map<string, ThreadMeta[]> | null | undefined>) {
  let next = new Map<string, ThreadMeta[]>();

  for (const current of maps) {
    if (!current) {
      continue;
    }

    for (const threads of current.values()) {
      for (const thread of threads) {
        next = addThreadMetaToMap(next, thread.threadId, thread);
      }
    }
  }

  return next;
}

function addThreadMetaToMap(
  prev: Map<string, ThreadMeta[]>,
  threadId: string,
  source: ThreadSource
) {
  const next = new Map(prev);
  const existing = next.get(source.sourceMessageId) || [];

  if (existing.some((thread) => thread.threadId === threadId)) {
    return next;
  }

  next.set(source.sourceMessageId, [
    ...existing,
    { threadId, ...source },
  ]);

  return next;
}

function addThreadMetaToRecord(
  prev: ThreadMetaRecord,
  threadId: string,
  source: ThreadSource
) {
  const existing = prev[source.sourceMessageId] || [];

  if (existing.some((thread) => thread.threadId === threadId)) {
    return prev;
  }

  return {
    ...prev,
    [source.sourceMessageId]: [
      ...existing,
      { threadId, ...source },
    ],
  };
}

function mapThreadMessages(rows: Array<{
  id: string;
  role: string;
  content: string;
  created_at: string;
  search_metadata?: Message['searchMetadata'];
}>): ThreadMessage[] {
  return rows.map((message) => ({
    id: message.id,
    role: message.role as 'user' | 'assistant',
    content: message.content,
    timestamp: new Date(message.created_at),
    searchMetadata: message.search_metadata ?? null,
  }));
}

function mergeThreadMessages(
  serverMessages: ThreadMessage[],
  localMessages: ThreadMessage[]
): ThreadMessage[] {
  const merged = [...serverMessages];
  const isOptimisticId = (id: string) => /^\d+$/.test(id);

  for (const localMessage of localMessages) {
    const alreadyExists = merged.some(
      (serverMessage) =>
        serverMessage.id === localMessage.id ||
        (isOptimisticId(localMessage.id)
          && serverMessage.role === localMessage.role
          && serverMessage.content === localMessage.content
          && Math.abs(serverMessage.timestamp.getTime() - localMessage.timestamp.getTime()) < 5_000)
    );

    if (!alreadyExists) {
      merged.push(localMessage);
    }
  }

  return merged.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}

function toInlineThreadMarker(
  thread: ThreadMeta,
  status: ThreadSessionStatus = 'ready'
): InlineThreadMarker {
  return {
    markerId: thread.threadId,
    threadId: thread.threadId,
    sessionId: null,
    status,
    highlightedText: thread.highlightedText,
    sourceMessageId: thread.sourceMessageId,
    startOffset: thread.startOffset,
    endOffset: thread.endOffset,
  };
}

function toSessionThreadMarker(session: ThreadSession): InlineThreadMarker {
  return {
    markerId: session.threadId ?? session.sessionId,
    threadId: session.threadId,
    sessionId: session.sessionId,
    status: session.status,
    highlightedText: session.highlightedText,
    sourceMessageId: session.sourceMessageId,
    startOffset: session.startOffset,
    endOffset: session.endOffset,
  };
}

function buildInlineThreadMarkersMap(params: {
  persistedThreadsMap: Map<string, ThreadMeta[]>;
  threadStatuses?: ThreadStatusRecord;
  threadSessionsById: Record<string, ThreadSession>;
}) {
  const markersByMessageId = new Map<string, Map<string, InlineThreadMarker>>();

  const upsertMarker = (messageId: string, marker: InlineThreadMarker) => {
    const existingForMessage = markersByMessageId.get(messageId) || new Map<string, InlineThreadMarker>();
    const dedupeKey = marker.threadId
      ? `thread:${marker.threadId}`
      : `session:${marker.sessionId ?? marker.markerId}`;
    existingForMessage.set(dedupeKey, marker);
    markersByMessageId.set(messageId, existingForMessage);
  };

  for (const [messageId, threads] of params.persistedThreadsMap.entries()) {
    for (const thread of threads) {
      const status = params.threadStatuses?.[thread.threadId] ?? 'ready';
      upsertMarker(messageId, toInlineThreadMarker(thread, status));
    }
  }

  for (const session of Object.values(params.threadSessionsById)) {
    upsertMarker(session.sourceMessageId, toSessionThreadMarker(session));
  }

  return new Map<string, InlineThreadMarker[]>(
    Array.from(markersByMessageId.entries()).map(([messageId, markers]) => [
      messageId,
      Array.from(markers.values()).sort(
        (a, b) =>
          a.startOffset - b.startOffset
          || (b.endOffset - b.startOffset) - (a.endOffset - a.startOffset)
      ),
    ])
  );
}

function findLatestConversationForMentor(
  mentorId: string | null,
  conversations: ConversationListItem[]
) {
  return conversations.find((conversation) => conversation.mentor_id === mentorId) || null;
}

function buildFixtureThreadsMap(threads: ThreadMeta[]) {
  const next = new Map<string, ThreadMeta[]>();

  for (const thread of threads) {
    const existing = next.get(thread.sourceMessageId) || [];
    existing.push(thread);
    next.set(thread.sourceMessageId, existing);
  }

  return next;
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
  const [composerDraftInputsByChatKey, setComposerDraftInputsByChatKey] = useState<
    Record<string, string>
  >({});
  const [pendingChatRequestsByChatKey, setPendingChatRequestsByChatKey] = useState<
    Record<string, PendingChatRequest>
  >({});
  const [searchEnabled, setSearchEnabled] = useState(false);
  const [selectedModelId, setSelectedModelId] = usePersistedString<ChatModelId>(
    CHAT_MODEL_STORAGE_KEY,
    DEFAULT_CHAT_MODEL_ID,
    isChatModelId
  );
  const [chatModels, setChatModels] = useState<ChatModelListItem[]>(
    CHAT_MODEL_OPTIONS.map((option) => ({
      id: option.id,
      label: option.label,
      provider: option.provider,
      available: true,
      isDefault: option.id === DEFAULT_CHAT_MODEL_ID,
    }))
  );
  const [searchStatesByChatKey, setSearchStatesByChatKey] = useState<
    Record<string, SearchMetadata | null>
  >({});
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
  const [isRouteConversationLoading, setIsRouteConversationLoading] = useState(false);
  const [routeConversationError, setRouteConversationError] = useState<string | null>(null);

  const { learningMode, toggleLearningMode } = useLearningMode();
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
    handleSelectConversation,
    handleSelectDraft,
    handleSelectTemporaryChat,
    handleCreateDraftSelection,
    handleCreateTemporaryChat,
    handleCloseTemporaryChat,
    registerPrepareForChatSwitch,
    invokePrepareForChatSwitch,
    registerCloseTempChatCleanup,
    replacePersistentConversationUrl,
    openHomeWorkspace,
    buildHomeHref,
    routeConversationId,
    e2eQueryParam,
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // Tracks whether the next scroll-to-bottom should jump instantly (load/switch) vs animate (streaming)
  const scrollInstantRef = useRef(true);
  const splitPaneRef = useRef<HTMLDivElement>(null);
  const userHasScrolledRef = useRef(false);
  const programmaticTranscriptNavigationRef = useRef(false);
  const transcriptNavigationTimeoutRef = useRef<number | null>(null);
  const transcriptNavigationEndHandlerRef = useRef<EventListener | null>(null);
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
  const [userHasScrolled, setUserHasScrolled] = useState(false);
  const selectedDraftChat =
    selectedChat?.kind === 'draft'
      ? draftChats.find((draft) => draft.id === selectedChat.draftId) || null
      : null;
  const selectedTemporaryChat =
    selectedChat?.kind === 'temporary'
      ? temporaryChats.find((chat) => chat.id === selectedChat.tempChatId) || null
      : null;
  const selectedConversation =
    selectedChat?.kind === 'persistent'
      ? conversations.find(
          (conversation) => conversation.id === selectedChat.conversationId
        ) || null
      : null;
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
  const selectedPersistentThreadRuntime =
    selectedChat?.kind === 'persistent'
      ? persistentThreadRuntimes[selectedChat.conversationId] ?? createEmptyPersistentThreadRuntime()
      : null;

  const activeMentorId =
    selectedChat?.kind === 'temporary' ? null : selectedChat?.mentorId ?? null;
  const activeMentor =
    activeMentorId ? mentors.find((mentor) => mentor.id === activeMentorId) || null : null;
  const isTemporaryChat = selectedChat?.kind === 'temporary';
  const chatMode: ChatMode = isTemporaryChat ? 'temporary' : 'persistent';
  const activeTemporaryMemoryMode =
    selectedTemporaryChat?.memoryMode ?? DEFAULT_TEMPORARY_MEMORY_MODE;
  const activeConversationId =
    selectedChat?.kind === 'persistent' ? selectedChat.conversationId : null;
  const activeConversationMessages = isTemporaryChat
    ? selectedTemporaryChat?.messages || []
    : selectedChat?.kind === 'draft'
      ? selectedDraftChat?.messages || []
      : selectedChat?.kind === 'persistent'
        ? persistentMessages
        : [];
  const activeConversationBranches = isTemporaryChat
    ? selectedTemporaryChat?.branches || []
    : selectedChat?.kind === 'draft'
      ? selectedDraftChat?.branches || []
      : selectedChat?.kind === 'persistent'
        ? persistentBranches
        : [];
  const activeSelectedBranchIds = isTemporaryChat
    ? selectedTemporaryChat?.selectedBranchIds || {}
    : selectedChat?.kind === 'draft'
      ? selectedDraftChat?.selectedBranchIds || {}
      : selectedChat?.kind === 'persistent'
        ? persistentSelectedBranchIds
        : {};
  const activeMessages = getActivePathMessages({
    messages: activeConversationMessages,
    branches: activeConversationBranches,
    selectedBranchIds: activeSelectedBranchIds,
    pendingBranch,
  });
  const conversationMapModel = buildConversationMapModel({
    messages: activeConversationMessages,
    branches: activeConversationBranches,
    selectedBranchIds: activeSelectedBranchIds,
    pendingBranchSourceMessageId: pendingBranch?.sourceMessageId ?? null,
    currentMessageId: currentMapMessageId,
    zoom: conversationMapViewState.zoom,
  });
  const hasConversationMap = conversationMapModel.branchPointIds.size > 0;
  const composerStateSelection: SelectedChat | null = selectedChat ?? (
    effectiveRouteConversationId
      ? {
          kind: 'persistent',
          conversationId: effectiveRouteConversationId,
          mentorId: null,
        }
      : null
  );
  const activeComposerStateKey = getComposerStateKey(composerStateSelection);
  const input = composerDraftInputsByChatKey[activeComposerStateKey] ?? '';
  const activePendingChatRequest =
    selectedChat
      ? pendingChatRequestsByChatKey[getSelectedChatKey(selectedChat)!] ?? null
      : null;
  const isLoading = activePendingChatRequest !== null;
  const activeSearchState = searchStatesByChatKey[activeComposerStateKey] ?? null;
  const activeThreadsMap = isTemporaryChat
    ? recordToThreadsMap(selectedTemporaryChat?.threadsMap)
    : selectedChat?.kind === 'persistent'
      ? mergeThreadsMaps(
          persistentThreadsMap,
          recordToThreadsMap(selectedPersistentThreadRuntime?.threadsMap)
        )
      : new Map<string, ThreadMeta[]>();
  const activeThreadStatuses = isTemporaryChat
    ? selectedTemporaryChat?.threadStatuses
    : selectedChat?.kind === 'persistent'
      ? selectedPersistentThreadRuntime?.threadStatuses
      : undefined;
  const activeThreadMarkersMap = buildInlineThreadMarkersMap({
    persistedThreadsMap: activeThreadsMap,
    threadStatuses: activeThreadStatuses,
    threadSessionsById,
  });
  const branchChipsByMessageId = new Map(
    activeMessages
      .filter((message) => message.role === 'assistant')
      .map((message) => [
        message.id,
        getBranchChipsForMessage({
          sourceMessageId: message.id,
          messages: activeConversationMessages,
          branches: activeConversationBranches,
          selectedBranchIds: activeSelectedBranchIds,
          pendingBranch,
        }),
      ] as const)
      .filter(([, chips]) => chips.length > 0)
  );
  const activeName = isTemporaryChat
    ? 'Keen'
    : selectedConversation?.mentor_name || activeMentor?.name || 'Keen';
  const isActiveConversationLoading =
    activePendingChatRequest?.phase === 'awaiting-response'
    && activeMessages.some((message) => message.id === activePendingChatRequest.userMessageId);

  const autoSendTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mentorSlugHandledRef = useRef(false);
  const appliedHomeE2eFixtureRef = useRef<string | null>(null);
  const hydratedRouteConversationIdRef = useRef<string | null>(null);
  const routeLoadRequestIdRef = useRef(0);
  const selectedDraftChatRef = useRef<PersistentDraftChat | null>(null);
  const persistentSelectedBranchIdsRef = useRef<BranchSelectionMap>({});
  const persistentThreadRuntimesRef = useRef<PersistentThreadRuntimeRecord>({});
  const temporaryChatsRef = useRef<TemporaryChatSession[]>([]);
  const composerDraftInputsRef = useRef<Record<string, string>>({});
  const pendingChatRequestsRef = useRef<Record<string, PendingChatRequest>>({});
  const threadSessionsRef = useRef<Record<string, ThreadSession>>({});
  // Keep refs aligned with latest render (draft promotion + branch merge reads these).
  persistentSelectedBranchIdsRef.current = persistentSelectedBranchIds;
  persistentThreadRuntimesRef.current = persistentThreadRuntimes;
  temporaryChatsRef.current = temporaryChats;
  composerDraftInputsRef.current = composerDraftInputsByChatKey;
  pendingChatRequestsRef.current = pendingChatRequestsByChatKey;
  threadSessionsRef.current = threadSessionsById;
  const shouldShowRouteConversationLoading =
    effectiveRouteConversationId !== null
    && activeMessages.length === 0
    && listError === null
    && hydratedRouteConversationIdRef.current !== effectiveRouteConversationId
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
    && activeMessages.length === 0
    && routeConversationError !== null;

  useEffect(() => {
    userHasScrolledRef.current = userHasScrolled;
  }, [userHasScrolled]);

  const setUserHasScrolledState = useCallback((nextValue: boolean) => {
    userHasScrolledRef.current = nextValue;
    setUserHasScrolled((current) => (current === nextValue ? current : nextValue));
  }, []);

  const endProgrammaticTranscriptNavigation = useCallback(() => {
    programmaticTranscriptNavigationRef.current = false;

    if (transcriptNavigationTimeoutRef.current !== null) {
      window.clearTimeout(transcriptNavigationTimeoutRef.current);
      transcriptNavigationTimeoutRef.current = null;
    }

    const container = containerRef.current;
    const scrollEndHandler = transcriptNavigationEndHandlerRef.current;
    if (container && scrollEndHandler) {
      container.removeEventListener('scrollend', scrollEndHandler);
    }

    transcriptNavigationEndHandlerRef.current = null;
  }, []);

  const beginProgrammaticTranscriptNavigation = useCallback(() => {
    const container = containerRef.current;
    endProgrammaticTranscriptNavigation();
    programmaticTranscriptNavigationRef.current = true;

    if (container) {
      const handleScrollEnd: EventListener = () => {
        endProgrammaticTranscriptNavigation();
      };

      transcriptNavigationEndHandlerRef.current = handleScrollEnd;
      container.addEventListener('scrollend', handleScrollEnd, { once: true });
    }

    transcriptNavigationTimeoutRef.current = window.setTimeout(() => {
      endProgrammaticTranscriptNavigation();
    }, TRANSCRIPT_NAVIGATION_LOCK_MS);
  }, [endProgrammaticTranscriptNavigation]);

  useEffect(() => {
    return () => {
      endProgrammaticTranscriptNavigation();
    };
  }, [endProgrammaticTranscriptNavigation]);

  const setComposerInputForSelection = useCallback(
    (selection: SelectedChat | null, value: string) => {
      const key = getComposerStateKey(selection);

      setComposerDraftInputsByChatKey((prev) => {
        if (value.length === 0) {
          return deleteRecordKey(prev, key);
        }

        if (prev[key] === value) {
          return prev;
        }

        return {
          ...prev,
          [key]: value,
        };
      });
    },
    []
  );

  const clearComposerInputForSelection = useCallback((selection: SelectedChat | null) => {
    const key = getComposerStateKey(selection);
    setComposerDraftInputsByChatKey((prev) => deleteRecordKey(prev, key));
  }, []);

  const setSearchStateForSelection = useCallback(
    (selection: SelectedChat | null, value: SearchMetadata | null) => {
      const key = getComposerStateKey(selection);

      setSearchStatesByChatKey((prev) => {
        if (value === null) {
          return deleteRecordKey(prev, key);
        }

        return {
          ...prev,
          [key]: value,
        };
      });
    },
    []
  );

  const clearSearchStateForSelection = useCallback((selection: SelectedChat | null) => {
    const key = getComposerStateKey(selection);
    setSearchStatesByChatKey((prev) => deleteRecordKey(prev, key));
  }, []);

  const setPendingChatRequestForSelection = useCallback(
    (selection: SelectedChat, request: PendingChatRequest | null) => {
      const key = getSelectedChatKey(selection);

      if (!key) {
        return;
      }

      setPendingChatRequestsByChatKey((prev) => {
        const next =
          request === null
            ? deleteRecordKey(prev, key)
            : {
                ...prev,
                [key]: request,
              };

        pendingChatRequestsRef.current = next;
        return next;
      });
    },
    []
  );

  const clearPendingChatRequestForSelection = useCallback((selection: SelectedChat) => {
    setPendingChatRequestForSelection(selection, null);
  }, [setPendingChatRequestForSelection]);

  const movePendingChatRequestBetweenSelections = useCallback(
    (fromSelection: SelectedChat, toSelection: SelectedChat) => {
      const fromKey = getSelectedChatKey(fromSelection);
      const toKey = getSelectedChatKey(toSelection);

      if (!fromKey || !toKey || fromKey === toKey) {
        return;
      }

      setPendingChatRequestsByChatKey((prev) => {
        const request = prev[fromKey];

        if (!request) {
          return prev;
        }

        const next: Record<string, PendingChatRequest> = {
          ...prev,
          [toKey]: {
            ...request,
            selection: toSelection,
          },
        };
        delete next[fromKey];
        pendingChatRequestsRef.current = next;
        return next;
      });
    },
    []
  );

  const setPendingChatRequestPhaseForSelection = useCallback(
    (
      selection: SelectedChat,
      phase: PendingChatRequest['phase']
    ) => {
      const key = getSelectedChatKey(selection);

      if (!key) {
        return;
      }

      setPendingChatRequestsByChatKey((prev) => {
        const current = prev[key];

        if (!current || current.phase === phase) {
          return prev;
        }

        const next = {
          ...prev,
          [key]: {
            ...current,
            phase,
          },
        };

        pendingChatRequestsRef.current = next;
        return next;
      });
    },
    []
  );

  useEffect(() => {
    const stored = window.sessionStorage.getItem(COMPOSER_DRAFT_INPUTS_STORAGE_KEY);
    if (!stored) {
      return;
    }

    try {
      const parsed = JSON.parse(stored) as Record<string, unknown>;
      const restoredDrafts = Object.fromEntries(
        Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
      );
      setComposerDraftInputsByChatKey(restoredDrafts);
    } catch (error) {
      console.error('Failed to restore composer drafts:', error);
      window.sessionStorage.removeItem(COMPOSER_DRAFT_INPUTS_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (Object.keys(composerDraftInputsByChatKey).length === 0) {
      window.sessionStorage.removeItem(COMPOSER_DRAFT_INPUTS_STORAGE_KEY);
      return;
    }

    window.sessionStorage.setItem(
      COMPOSER_DRAFT_INPUTS_STORAGE_KEY,
      JSON.stringify(composerDraftInputsByChatKey)
    );
  }, [composerDraftInputsByChatKey]);

  useEffect(() => {
    const stored = window.sessionStorage.getItem(PERSISTENT_THREAD_RUNTIME_STORAGE_KEY);
    if (!stored) {
      return;
    }

    try {
      setPersistentThreadRuntimes(deserializePersistentThreadRuntimes(stored));
    } catch (error) {
      console.error('Failed to restore persistent thread runtime:', error);
      window.sessionStorage.removeItem(PERSISTENT_THREAD_RUNTIME_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (Object.keys(persistentThreadRuntimes).length === 0) {
      window.sessionStorage.removeItem(PERSISTENT_THREAD_RUNTIME_STORAGE_KEY);
      return;
    }

    window.sessionStorage.setItem(
      PERSISTENT_THREAD_RUNTIME_STORAGE_KEY,
      serializePersistentThreadRuntimes(persistentThreadRuntimes)
    );
  }, [persistentThreadRuntimes]);

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
    selectedDraftChatRef.current = selectedDraftChat;
  }, [selectedDraftChat]);

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

  useEffect(() => {
    if (!messagesEndRef.current) {
      return;
    }

    if (!userHasScrolledRef.current) {
      const behavior = scrollInstantRef.current ? 'instant' : 'smooth';
      scrollInstantRef.current = false;
      messagesEndRef.current.scrollIntoView({ behavior });
    }
  }, [activeMessages]);

  const updateCurrentVisibleMapMessage = useCallback(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const messageElements = Array.from(
      container.querySelectorAll<HTMLElement>('[data-message-id]')
    );
    if (messageElements.length === 0) {
      setCurrentMapMessageId(null);
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const anchorY = containerRect.top + Math.min(container.clientHeight * 0.34, 240);
    let bestId = messageElements[messageElements.length - 1]?.dataset.messageId ?? null;
    let bestScore = Number.POSITIVE_INFINITY;

    messageElements.forEach((element) => {
      const rect = element.getBoundingClientRect();
      if (rect.bottom < containerRect.top + 24 || rect.top > containerRect.bottom - 24) {
        return;
      }

      const score =
        rect.top <= anchorY && rect.bottom >= anchorY
          ? 0
          : Math.min(Math.abs(rect.top - anchorY), Math.abs(rect.bottom - anchorY));

      if (score < bestScore) {
        bestScore = score;
        bestId = element.dataset.messageId ?? bestId;
      }
    });

    setCurrentMapMessageId(bestId);
  }, []);

  const handleScroll = () => {
    const container = containerRef.current;
    if (!container) return;

    if (!programmaticTranscriptNavigationRef.current) {
      const isAtBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight < 100;
      setUserHasScrolledState(!isAtBottom);
    }

    updateCurrentVisibleMapMessage();
  };

  useEffect(() => {
    if (activeMessages.length === 0) {
      setCurrentMapMessageId(null);
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      updateCurrentVisibleMapMessage();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activeMessages, updateCurrentVisibleMapMessage]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(
        textareaRef.current.scrollHeight,
        200
      )}px`;
    }
  }, [input]);

  useEffect(() => {
    let cancelled = false;

    const loadChatModels = async () => {
      try {
        const response = await fetch('/api/chat/models', { cache: 'no-store' });
        const data = (await response.json()) as ChatModelsResponse;

        if (!response.ok || data.error || !data.models) {
          throw new Error(data.error || 'Failed to load chat models');
        }

        if (!cancelled) {
          setChatModels(data.models);
        }
      } catch {
        // Keep the optimistic client-side catalog if the server list can't load.
      }
    };

    void loadChatModels();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const hasSelectedModel = chatModels.some(
      (model) => model.id === selectedModelId && model.available
    );

    if (hasSelectedModel) {
      return;
    }

    const fallbackModel =
      chatModels.find((model) => model.isDefault && model.available) ||
      chatModels.find((model) => model.available) ||
      null;

    if (fallbackModel) {
      setSelectedModelId(fallbackModel.id);
    }
  }, [chatModels, selectedModelId, setSelectedModelId]);
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

  useEffect(() => {
    if (!homeE2eFixture || appliedHomeE2eFixtureRef.current === homeE2eFixture.key) {
      return;
    }

    appliedHomeE2eFixtureRef.current = homeE2eFixture.key;
    tts.stop();
    stopMic();
    resetThreadUi();
    setPendingBranch(null);
    window.sessionStorage.removeItem(COMPOSER_DRAFT_INPUTS_STORAGE_KEY);
    setComposerDraftInputsByChatKey({});
    setPendingChatRequestsByChatKey({});
    setSearchStatesByChatKey({});
    endProgrammaticTranscriptNavigation();
    setUserHasScrolledState(false);
    setListError(null);
    setDraftChats([]);

    if (homeE2eFixture.chatMode === 'temporary') {
      const fixtureThreads = buildFixtureThreadsMap(homeE2eFixture.threads || []);
      const fixtureChatId = `fixture-temp-${homeE2eFixture.key}`;
      const now = new Date().toISOString();

      setPersistentMessages([]);
      setPersistentBranches([]);
      setPersistentSelectedBranchIds({});
      setPersistentThreadsMap(new Map());
      setTemporaryChats([
        {
          id: fixtureChatId,
          title: TEMP_CHAT_TITLE,
          memoryMode: DEFAULT_TEMPORARY_MEMORY_MODE,
          createdAt: now,
          updatedAt: now,
          messages: homeE2eFixture.messages,
          branches: homeE2eFixture.branches || [],
          selectedBranchIds: homeE2eFixture.selectedBranchIds || {},
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
    setPersistentMessages(homeE2eFixture.messages);
    setPersistentBranches(homeE2eFixture.branches || []);
    setPersistentSelectedBranchIds(homeE2eFixture.selectedBranchIds || {});
    setPersistentThreadsMap(buildFixtureThreadsMap(homeE2eFixture.threads || []));
    setSelectedChat({
      kind: 'persistent',
      conversationId:
        homeE2eFixture.conversationId ?? `fixture-${homeE2eFixture.key}`,
      mentorId: null,
    });
  }, [
    endProgrammaticTranscriptNavigation,
    homeE2eFixture,
    resetThreadUi,
    setUserHasScrolledState,
    setListError,
    stopMic,
    tts,
  ]);

  const prepareForChatSwitch = useCallback(
    (nextSelection: SelectedChat | null) => {
      tts.stop();
      stopMic();
      resetThreadUi();
      setPendingBranch(null);
      setConversationMapOpen(false);
      endProgrammaticTranscriptNavigation();
      setUserHasScrolledState(false);
      // Next scroll after a chat switch should jump instantly, not animate from top.
      scrollInstantRef.current = true;

      const currentSelection = selectedChatRef.current;
      const currentDraft = selectedDraftChatRef.current;
      const currentInput = currentSelection
        ? composerDraftInputsRef.current[getComposerStateKey(currentSelection)] ?? ''
        : '';

      const shouldClearPersistentConversationState =
        nextSelection === null || nextSelection.kind === 'persistent';

      if (shouldClearPersistentConversationState) {
        // When leaving a routed conversation for a draft or temporary chat, keep the
        // persistent transcript in memory until the URL has actually finished leaving
        // /home/<conversationId>. Clearing it early retriggers route hydration for the
        // old conversation and steals selection back during the transition.
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
        clearSearchStateForSelection(currentSelection);
        clearPendingChatRequestForSelection(currentSelection);
      }
    },
    [
      clearComposerInputForSelection,
      clearPendingChatRequestForSelection,
      clearSearchStateForSelection,
      endProgrammaticTranscriptNavigation,
      resetThreadUi,
      setConversationMapOpen,
      setUserHasScrolledState,
      stopMic,
      tts,
    ]
  );

  // Register this page's side-effect cleanup into the context so layout-level
  // selection actions (sidebar clicks) can trigger TTS stop, mic stop, etc.
  useEffect(() => {
    registerPrepareForChatSwitch(prepareForChatSwitch);
  }, [prepareForChatSwitch, registerPrepareForChatSwitch]);

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
        || persistentMessages.length > 0
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
    isHomeE2eFixture,
    loadConversationById,
    loadConversationMessages,
    effectiveRouteConversationId,
    persistentMessages.length,
  ]);

  // Register page-local cleanup (composer/search/pending) for when temp chats are closed
  useEffect(() => {
    registerCloseTempChatCleanup((tempChatId: string) => {
      const closedSelection: SelectedChat = { kind: 'temporary', tempChatId };
      clearComposerInputForSelection(closedSelection);
      clearSearchStateForSelection(closedSelection);
      clearPendingChatRequestForSelection(closedSelection);
    });
  }, [
    registerCloseTempChatCleanup,
    clearComposerInputForSelection,
    clearSearchStateForSelection,
    clearPendingChatRequestForSelection,
  ]);

  const setTemporaryThreadMessages = useCallback(
    (tempChatId: string, threadId: string, nextMessages: ThreadMessage[]) => {
      updateTemporaryChat(tempChatId, (chat) => {
        const nextThreadMessages = { ...chat.threadMessages };

        if (nextMessages.length === 0) {
          delete nextThreadMessages[threadId];
        } else {
          nextThreadMessages[threadId] = nextMessages;
        }

        return {
          ...chat,
          threadMessages: nextThreadMessages,
          updatedAt: new Date().toISOString(),
        };
      });
    },
    [updateTemporaryChat]
  );

  const updatePersistentThreadRuntime = useCallback(
    (
      conversationId: string,
      updater: (runtime: PersistentThreadRuntime) => PersistentThreadRuntime
    ) => {
      setPersistentThreadRuntimes((prev) => {
        const existing = prev[conversationId] ?? createEmptyPersistentThreadRuntime();
        const nextRuntime = updater(existing);
        if (nextRuntime === existing) {
          return prev;
        }

        return {
          ...prev,
          [conversationId]: nextRuntime,
        };
      });
    },
    []
  );

  const setSelectedTemporaryThreadMessagesForThread = useCallback(
    (threadId: string, nextMessages: ThreadMessage[]) => {
      if (selectedChat?.kind !== 'temporary') {
        return;
      }

      setTemporaryThreadMessages(selectedChat.tempChatId, threadId, nextMessages);
    },
    [selectedChat, setTemporaryThreadMessages]
  );

  const setPersistentThreadMessages = useCallback(
    (conversationId: string, threadId: string, nextMessages: ThreadMessage[]) => {
      updatePersistentThreadRuntime(conversationId, (runtime) => {
        const nextThreadMessages = { ...runtime.threadMessages };

        if (nextMessages.length === 0) {
          delete nextThreadMessages[threadId];
        } else {
          nextThreadMessages[threadId] = nextMessages;
        }

        return {
          ...runtime,
          threadMessages: nextThreadMessages,
        };
      });
    },
    [updatePersistentThreadRuntime]
  );

  const setTemporaryThreadStatus = useCallback(
    (tempChatId: string, threadId: string, status: ThreadSessionStatus) => {
      updateTemporaryChat(tempChatId, (chat) => ({
        ...chat,
        threadStatuses: {
          ...chat.threadStatuses,
          [threadId]: status,
        },
        updatedAt: new Date().toISOString(),
      }));
    },
    [updateTemporaryChat]
  );

  const setPersistentThreadStatus = useCallback(
    (conversationId: string, threadId: string, status: ThreadSessionStatus) => {
      updatePersistentThreadRuntime(conversationId, (runtime) => ({
        ...runtime,
        threadStatuses: {
          ...runtime.threadStatuses,
          [threadId]: status,
        },
      }));
    },
    [updatePersistentThreadRuntime]
  );

  const setSelectedTemporaryThreadStatusForThread = useCallback(
    (threadId: string, status: ThreadSessionStatus) => {
      if (selectedChat?.kind !== 'temporary') {
        return;
      }

      setTemporaryThreadStatus(selectedChat.tempChatId, threadId, status);
    },
    [selectedChat, setTemporaryThreadStatus]
  );

  const addTemporaryThreadMeta = useCallback(
    (tempChatId: string, threadId: string, source: ThreadSource) => {
      updateTemporaryChat(tempChatId, (chat) => ({
        ...chat,
        threadsMap: addThreadMetaToRecord(chat.threadsMap, threadId, source),
        updatedAt: new Date().toISOString(),
      }));
    },
    [updateTemporaryChat]
  );

  const addPersistentThreadMeta = useCallback(
    (conversationId: string, threadId: string, source: ThreadSource) => {
      updatePersistentThreadRuntime(conversationId, (runtime) => ({
        ...runtime,
        threadsMap: addThreadMetaToRecord(runtime.threadsMap, threadId, source),
      }));

      if (
        selectedChatRef.current?.kind === 'persistent'
        && selectedChatRef.current.conversationId === conversationId
      ) {
        setPersistentThreadsMap((prev) => addThreadMetaToMap(prev, threadId, source));
      }
    },
    [updatePersistentThreadRuntime]
  );

  const addThreadMeta = useCallback(
    (threadId: string, source: ThreadSource) => {
      if (selectedChat?.kind === 'temporary') {
        addTemporaryThreadMeta(selectedChat.tempChatId, threadId, source);
        return;
      }

      if (selectedChat?.kind === 'persistent') {
        addPersistentThreadMeta(selectedChat.conversationId, threadId, source);
      }
    },
    [addPersistentThreadMeta, addTemporaryThreadMeta, selectedChat]
  );

  const buildThreadSession = useCallback(
    (
      source: ThreadSource,
      overrides?: Partial<Pick<ThreadSession, 'sessionId' | 'threadId' | 'status' | 'messages' | 'draftInput' | 'isHydrating'>>
    ): ThreadSession => ({
      sessionId: overrides?.sessionId ?? createTemporaryId('thread-session'),
      threadId: overrides?.threadId ?? null,
      status: overrides?.status ?? 'ready',
      messages: overrides?.messages ?? [],
      draftInput: overrides?.draftInput ?? '',
      isHydrating: overrides?.isHydrating ?? false,
      highlightedText: source.highlightedText,
      sourceMessageId: source.sourceMessageId,
      startOffset: source.startOffset,
      endOffset: source.endOffset,
    }),
    []
  );

  const persistThreadResult = useCallback(
    (
      params: {
        selection: SelectedChat;
        source: ThreadSource;
      },
      threadId: string | null,
      nextMessages: ThreadMessage[],
      status: ThreadSessionStatus
    ) => {
      if (!threadId) {
        return;
      }

      if (params.selection.kind === 'temporary') {
        addTemporaryThreadMeta(params.selection.tempChatId, threadId, params.source);
        setTemporaryThreadMessages(params.selection.tempChatId, threadId, nextMessages);
        setTemporaryThreadStatus(params.selection.tempChatId, threadId, status);
        return;
      }

      if (params.selection.kind === 'persistent') {
        addPersistentThreadMeta(params.selection.conversationId, threadId, params.source);
        setPersistentThreadMessages(params.selection.conversationId, threadId, nextMessages);
        setPersistentThreadStatus(params.selection.conversationId, threadId, status);
      }
    },
    [
      addPersistentThreadMeta,
      addTemporaryThreadMeta,
      setPersistentThreadMessages,
      setPersistentThreadStatus,
      setTemporaryThreadMessages,
      setTemporaryThreadStatus,
    ]
  );

  const sendThreadRequest = useCallback(
    async (params: {
      sessionId: string;
      question: string;
      selection: SelectedChat;
      source: ThreadSource;
      requestThreadId: string | null;
      previousMessages: ThreadMessage[];
      optimisticMessages: ThreadMessage[];
      optimisticUserMessageId: string;
    }) => {
      const finalizeThreadState = (options: {
        status: ThreadSessionStatus;
        threadId: string | null;
        assistantMessage: ThreadMessage;
        resolvedUserMessageId?: string | null;
      }) => {
        const latestSession = threadSessionsRef.current[params.sessionId];
        const reconciledMessages = (latestSession?.messages ?? params.optimisticMessages).map(
          (message) =>
            message.id === params.optimisticUserMessageId && options.resolvedUserMessageId
              ? { ...message, id: options.resolvedUserMessageId }
              : message
        );
        const nextMessages = [...reconciledMessages, options.assistantMessage];
        const nextThreadId = options.threadId ?? latestSession?.threadId ?? null;

        if (latestSession) {
          updateThreadSession(params.sessionId, () => ({
            ...latestSession,
            threadId: nextThreadId,
            status: options.status,
            isHydrating: false,
            messages: nextMessages,
          }));
        }

        persistThreadResult(
          {
            selection: params.selection,
            source: params.source,
          },
          nextThreadId,
          nextMessages,
          options.status
        );
      };

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: params.question,
            conversationId:
              params.selection.kind === 'persistent'
                ? params.selection.conversationId
                : undefined,
            mentorId:
              params.selection.kind === 'temporary'
                ? undefined
                : params.selection.mentorId ?? undefined,
            modelId: selectedModelId,
            sourceMessageId: params.source.sourceMessageId,
            highlightedText: params.source.highlightedText,
            startOffset: params.source.startOffset,
            endOffset: params.source.endOffset,
            ...(params.requestThreadId ? { threadId: params.requestThreadId } : {}),
            timezone: getBrowserTimeZone(),
            chatMode: params.selection.kind === 'temporary' ? 'temporary' : 'persistent',
            ...(params.selection.kind === 'temporary'
              ? {
                  memoryMode: activeTemporaryMemoryMode,
                  history: toChatHistory(activeMessages),
                  threadHistory: toChatHistory(params.previousMessages),
                }
              : {}),
          }),
        });

        // Drain the stream but discard text chunks — threads don't stream in place.
        const data = response.ok
          ? await readChatStream(response, () => {})
          : (await response.json()) as ChatResponse;

        logResolvedChatModel(data, 'thread');
        const resolvedThreadId =
          typeof data.threadId === 'string' && data.threadId.length > 0
            ? data.threadId
            : params.requestThreadId;

        if (!response.ok || data.error || !data.message) {
          finalizeThreadState({
            status: 'error',
            threadId: resolvedThreadId,
            assistantMessage: {
              id:
                params.selection.kind === 'temporary'
                  ? createTemporaryId('message')
                  : (Date.now() + 1).toString(),
              role: 'assistant',
              content: data.error || 'Something went wrong.',
              timestamp: new Date(),
            },
            resolvedUserMessageId: data.userMessageId,
          });
          return;
        }

        finalizeThreadState({
          status: 'ready',
          threadId: resolvedThreadId,
          assistantMessage: {
            id:
              params.selection.kind === 'temporary'
                ? createTemporaryId('message')
                : data.assistantMessageId || (Date.now() + 1).toString(),
            role: 'assistant',
            content: data.message,
            timestamp: new Date(),
            searchMetadata: data.search?.metadata ?? null,
          },
          resolvedUserMessageId: data.userMessageId,
        });
      } catch {
        finalizeThreadState({
          status: 'error',
          threadId: params.requestThreadId,
          assistantMessage: {
            id:
              params.selection.kind === 'temporary'
                ? createTemporaryId('message')
                : (Date.now() + 1).toString(),
            role: 'assistant',
            content: 'Something went wrong.',
            timestamp: new Date(),
          },
        });
      }
    },
    [
      activeMessages,
      activeTemporaryMemoryMode,
      persistThreadResult,
      selectedModelId,
      updateThreadSession,
    ]
  );

  const submitThreadQuestion = useCallback(
    (source: ThreadSource, question: string) => {
      const trimmedQuestion = question.trim();
      if (!trimmedQuestion || !selectedChat) {
        return;
      }

      const selection = selectedChat;
      if (selection.kind !== 'temporary' && selection.kind !== 'persistent') {
        return;
      }

      if (selection.kind === 'persistent' && !activeConversationId) {
        return;
      }

      const requestThreadId =
        selection.kind === 'temporary' ? createTemporaryId('thread') : null;
      const userMessage: ThreadMessage = {
        id:
          selection.kind === 'temporary'
            ? createTemporaryId('message')
            : Date.now().toString(),
        role: 'user',
        content: trimmedQuestion,
        timestamp: new Date(),
      };
      const session = buildThreadSession(source, {
        threadId: requestThreadId,
        status: 'loading',
        messages: [userMessage],
      });

      createThreadSession(session, { makeActive: true });

      if (selection.kind === 'temporary' && requestThreadId) {
        addThreadMeta(requestThreadId, source);
        setSelectedTemporaryThreadMessagesForThread(requestThreadId, session.messages);
        setSelectedTemporaryThreadStatusForThread(requestThreadId, 'loading');
      }

      void sendThreadRequest({
        sessionId: session.sessionId,
        question: trimmedQuestion,
        selection,
        source,
        requestThreadId,
        previousMessages: [],
        optimisticMessages: session.messages,
        optimisticUserMessageId: userMessage.id,
      });
    },
    [
      activeConversationId,
      addThreadMeta,
      buildThreadSession,
      createThreadSession,
      selectedChat,
      sendThreadRequest,
      setSelectedTemporaryThreadMessagesForThread,
      setSelectedTemporaryThreadStatusForThread,
    ]
  );

  const openThreadDraft = useCallback(
    (source: ThreadSource, draftInput: string) => {
      const trimmedDraft = draftInput.trim();
      if (!trimmedDraft || !selectedChat) {
        return;
      }

      const selection = selectedChat;
      if (selection.kind !== 'temporary' && selection.kind !== 'persistent') {
        return;
      }

      if (selection.kind === 'persistent' && !activeConversationId) {
        return;
      }

      createThreadSession(
        buildThreadSession(source, {
          draftInput: trimmedDraft,
        }),
        { makeActive: true }
      );
    },
    [activeConversationId, buildThreadSession, createThreadSession, selectedChat]
  );

  const handleThreadPanelInputChange = useCallback(
    (sessionId: string, value: string) => {
      updateThreadSession(sessionId, (session) => ({
        ...session,
        draftInput: value,
      }));
    },
    [updateThreadSession]
  );

  const handleSendThreadMessage = useCallback(
    (sessionId: string, overrideContent?: string) => {
      const session = threadSessionsRef.current[sessionId];
      if (!session || session.status === 'loading' || session.isHydrating || !selectedChat) {
        return;
      }

      const selection = selectedChat;
      if (selection.kind !== 'temporary' && selection.kind !== 'persistent') {
        return;
      }

      if (selection.kind === 'persistent' && !activeConversationId) {
        return;
      }

      const content = overrideContent?.trim() || session.draftInput.trim();
      if (!content) {
        return;
      }

      const requestThreadId =
        session.threadId ?? (selection.kind === 'temporary' ? createTemporaryId('thread') : null);
      const userMessage: ThreadMessage = {
        id:
          selection.kind === 'temporary'
            ? createTemporaryId('message')
            : Date.now().toString(),
        role: 'user',
        content,
        timestamp: new Date(),
      };
      const nextMessages = [...session.messages, userMessage];

      updateThreadSession(sessionId, () => ({
        ...session,
        threadId: requestThreadId ?? session.threadId,
        status: 'loading',
        draftInput: '',
        isHydrating: false,
        messages: nextMessages,
      }));

      if (selection.kind === 'temporary' && requestThreadId) {
        if (!session.threadId) {
          addThreadMeta(requestThreadId, session);
        }
        setSelectedTemporaryThreadMessagesForThread(requestThreadId, nextMessages);
        setSelectedTemporaryThreadStatusForThread(requestThreadId, 'loading');
      }

      void sendThreadRequest({
        sessionId,
        question: content,
        selection,
        source: session,
        requestThreadId,
        previousMessages: session.messages,
        optimisticMessages: nextMessages,
        optimisticUserMessageId: userMessage.id,
      });
    },
    [
      activeConversationId,
      addThreadMeta,
      selectedChat,
      sendThreadRequest,
      setSelectedTemporaryThreadMessagesForThread,
      setSelectedTemporaryThreadStatusForThread,
      updateThreadSession,
    ]
  );

  const handleThreadMarkerClick = useCallback(
    async (thread: InlineThreadMarker) => {
      if (thread.sessionId && threadSessionsRef.current[thread.sessionId]) {
        activateThreadSession(thread.sessionId);
        return;
      }

      if (thread.threadId) {
        const existingSessionId = findThreadSessionId(thread.threadId);
        if (existingSessionId) {
          activateThreadSession(existingSessionId);
          return;
        }
      }

      if (selectedChat?.kind === 'temporary' && thread.threadId) {
        const storedMessages = selectedTemporaryChat?.threadMessages[thread.threadId] ?? [];
        const storedStatus = selectedTemporaryChat?.threadStatuses[thread.threadId] ?? 'ready';
        createThreadSession(
          buildThreadSession(thread, {
            threadId: thread.threadId,
            status: storedStatus,
            messages: storedMessages,
          }),
          { makeActive: true }
        );
        return;
      }

      if (!thread.threadId) {
        return;
      }

      const persistentRuntime =
        selectedChat?.kind === 'persistent'
          ? persistentThreadRuntimesRef.current[selectedChat.conversationId]
          : null;
      const storedMessages = persistentRuntime?.threadMessages[thread.threadId] ?? [];
      const storedStatus = persistentRuntime?.threadStatuses[thread.threadId] ?? 'ready';
      const sessionId = `persisted:${thread.threadId}`;
      createThreadSession(
        buildThreadSession(thread, {
          sessionId,
          threadId: thread.threadId,
          status: storedStatus,
          messages: storedMessages,
          isHydrating: storedMessages.length === 0,
        }),
        { makeActive: true }
      );

      try {
        const response = await fetch(`/api/threads/${thread.threadId}/messages`);
        if (!response.ok) {
          throw new Error('Failed to load thread messages');
        }

        const data = await response.json();
        const nextMessages = mapThreadMessages(
          (data.messages || []) as Array<{
            id: string;
            role: string;
            content: string;
            created_at: string;
            search_metadata?: Message['searchMetadata'];
          }>
        );

        updateThreadSession(sessionId, (session) => ({
          ...session,
          messages: mergeThreadMessages(nextMessages, session.messages),
          isHydrating: false,
          status: session.status === 'error' ? session.status : 'ready',
        }));
      } catch {
        updateThreadSession(sessionId, (session) => ({
          ...session,
          isHydrating: false,
        }));
      }
    },
    [
      activateThreadSession,
      buildThreadSession,
      createThreadSession,
      findThreadSessionId,
      selectedChat?.kind,
      selectedChat?.kind === 'persistent' ? selectedChat.conversationId : null,
      selectedTemporaryChat?.threadMessages,
      selectedTemporaryChat?.threadStatuses,
      updateThreadSession,
    ]
  );

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
    [selectedChat, updateDraftBranchSelection, updateTemporaryChat]
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
  }, [setUserHasScrolledState]);

  const jumpToMessage = useCallback((messageId: string) => {
    const selector =
      typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
        ? `[data-message-id="${CSS.escape(messageId)}"]`
        : `[data-message-id="${messageId.replace(/["\\]/g, '\\$&')}"]`;

    setUserHasScrolledState(true);
    let attempts = 0;

    const scrollToTarget = () => {
      const container = containerRef.current;
      const target = container?.querySelector<HTMLElement>(selector);
      if (!container || !target) {
        if (typeof window !== 'undefined' && attempts < JUMP_TO_MESSAGE_MAX_ATTEMPTS) {
          attempts += 1;
          window.requestAnimationFrame(scrollToTarget);
        }
        return;
      }

      beginProgrammaticTranscriptNavigation();
      const containerRect = container.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const nextTop = Math.max(
        0,
        container.scrollTop + (targetRect.top - containerRect.top) - MAP_SCROLL_TOP_OFFSET
      );

      container.scrollTo({
        top: nextTop,
        behavior: 'smooth',
      });
    };

    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(scrollToTarget);
      return;
    }

    scrollToTarget();
  }, [beginProgrammaticTranscriptNavigation, setUserHasScrolledState]);

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
    [pendingBranch, setUserHasScrolledState, updateActiveBranchSelection]
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
      updateActiveBranchSelections,
    ]
  );

  const handleToggleConversationMap = useCallback(() => {
    if (!conversationMapOpen) {
      if (threadPanelOpen) {
        closeThreadPanel()
      }

      if (popoverState) {
        dismissPopover()
      }
    }

    toggleConversationMapOpen()
  }, [
    closeThreadPanel,
    conversationMapOpen,
    dismissPopover,
    popoverState,
    threadPanelOpen,
    toggleConversationMapOpen,
  ])

  const handleStartMapResize = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const container = splitPaneRef.current;
      if (!container) {
        return;
      }

      const rect = container.getBoundingClientRect();

      const handlePointerMove = (moveEvent: PointerEvent) => {
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
    [clampSplitRatio, updateConversationMapViewState]
  );

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
    pendingBranch,
    pendingChatRequestsRef,
    persistentBranches,
    persistentMessages,
    persistentSelectedBranchIds,
    persistentSelectedBranchIdsRef,
    refreshSidebarData,
    searchEnabled,
    selectedChat,
    selectedChatRef,
    selectedDraftChat,
    selectedModelId,
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
    ttsEnabled,
    updateDraftChat,
    updateTemporaryChat,
  });

  useEffect(() => {
    const text = transcription.finalTranscript.trim();
    const hasFinal = text.length > 0;
    const hasInterim = transcription.interimTranscript.length > 0;

    if (hasFinal && !hasInterim && micActive && !isLoading) {
      const lastChar = text[text.length - 1];
      const lastWord =
        text
          .split(/\s+/)
          .pop()
          ?.toLowerCase()
          .replace(/[.,!?;:]$/, '') ?? '';
      const wordCount = text.split(/\s+/).length;

      let delay: number;
      const incomplete = [
        'and',
        'but',
        'or',
        'so',
        'because',
        'since',
        'although',
        'however',
        'with',
        'to',
        'for',
        'the',
        'a',
        'an',
        'that',
        'which',
        'who',
        'if',
        'then',
        'like',
        'of',
        'in',
        'on',
        'about',
        'is',
        'are',
        'was',
        'were',
      ];

      if (incomplete.includes(lastWord) || lastChar === ',' || lastChar === ';' || lastChar === ':') {
        delay = 4000;
      } else if (lastChar === '.' || lastChar === '?' || lastChar === '!') {
        delay = wordCount <= 4 ? 1500 : 2000;
      } else {
        delay = 3000;
      }

      autoSendTimerRef.current = setTimeout(() => {
        sendMessage(transcription.finalTranscript.trim());
        autoSendTimerRef.current = null;
      }, delay);
    }

    return () => {
      if (autoSendTimerRef.current) {
        clearTimeout(autoSendTimerRef.current);
        autoSendTimerRef.current = null;
      }
    };
  }, [
    isLoading,
    micActive,
    sendMessage,
    transcription.finalTranscript,
    transcription.interimTranscript,
  ]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const textToSend = input.trim();
    if (textToSend) {
      sendMessage(textToSend);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const emptyTitle = isTemporaryChat
    ? TEMP_CHAT_TITLE
    : selectedChat?.kind === 'draft'
      ? 'New chat'
      : activeMentor
        ? `Talk to ${activeMentor.name}`
        : 'What are we exploring today?';
  const emptySubtitle = isTemporaryChat
    ? 'Nothing from this chat will be saved.'
    : selectedChat?.kind === 'draft'
      ? activeMentor?.tagline || 'Start a new conversation.'
      : activeMentor
        ? activeMentor.tagline
        : 'Start typing, or choose a mentor from the grid.';

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
          micActive={micActive}
          selectedModelId={selectedModelId}
          ttsEnabled={ttsEnabled}
          searchEnabled={searchEnabled}
          learningMode={learningMode}
          temporaryChatEnabled={isTemporaryChat}
          showTemporaryIntro={isTemporaryChat && activeMessages.length === 0}
          temporaryMemoryMode={activeTemporaryMemoryMode}
          finalTranscript={transcription.finalTranscript}
          interimTranscript={transcription.interimTranscript}
          transcriptionStatus={transcription.status}
          microphoneStatus={microphone.status}
          microphoneErrorMessage={microphone.errorMessage}
          searchWarning={activeSearchState?.warning ?? null}
          isTtsLoading={tts.isLoading}
          isTtsPlaying={tts.isPlaying}
          textareaRef={textareaRef}
          waveformRef={visualization.lineRef}
          waveformGlowRef={visualization.glowRef}
          waveformContainerRef={visualization.visualRef}
          onInputChange={(value) => setComposerInputForSelection(composerStateSelection, value)}
          onModelChange={setSelectedModelId}
          onToggleMic={toggleMic}
          onToggleTts={toggleTtsEnabled}
          onToggleSearch={() => setSearchEnabled((prev) => !prev)}
          onToggleLearningMode={toggleLearningMode}
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

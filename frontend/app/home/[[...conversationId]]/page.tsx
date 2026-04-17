"use client";

import { Suspense, useState, useCallback, useRef, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import HomeBackground from '@/app/home/components/HomeBackground';
import HomeHeader from '@/app/home/components/HomeHeader';
import ChatComposer from '@/app/home/components/ChatComposer';
import BranchNavigator, {
  type BranchNavigatorItem,
} from '@/app/home/components/BranchNavigator';
import ConversationView from '@/app/home/components/ConversationView';
import {
  applyUserMessageToTree,
  createPendingBranchTarget,
  getActivePathMessages,
  getBranchChipsForMessage,
  type PendingBranchTarget,
} from '@/app/home/components/conversationTree';
import { logResolvedChatModel } from '@/app/home/components/logResolvedChatModel';
import { useHomeData } from '@/app/home/components/useHomeData';
import { useHomeThreads } from '@/app/home/components/useHomeThreads';
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
import { stripCitationMarkers } from '@/lib/search-citations';
import {
  CHAT_MODEL_OPTIONS,
  DEFAULT_CHAT_MODEL_ID,
  isChatModelId,
  type ChatModelId,
  type ChatModelListItem,
} from '@/lib/chat-models';
import type { MentorListItem } from '@/lib/mentors/types';
import SidePanel from '@/app/home/components/SidePanel';
import MentorDetailPanel from '@/app/home/components/MentorDetailPanel';
import CreateMentorPanel from '@/app/home/components/CreateMentorPanel';
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
  fallbackChatTitleFromMessage,
  toChatHistory,
  type ChatMode,
  type TemporaryMemoryMode,
} from '@/lib/chat-session';
import { getBrowserTimeZone } from '@/lib/browser-timezone';

interface ChatResponse {
  message?: string;
  conversationId?: string;
  conversationTitle?: string | null;
  mentorId?: string | null;
  threadId?: string | null;
  userMessageId?: string | null;
  assistantMessageId?: string | null;
  resolvedModelId?: string;
  resolvedProvider?: string;
  search?: SearchMetadata;
  error?: string;
}

/**
 * Reads an AI SDK v6 UI message stream response (SSE format).
 * Calls onChunk with each text delta as tokens arrive.
 * Returns the metadata object sent in the final data-chatMeta part.
 *
 * Relevant SSE event types (data: {...} JSON objects):
 *   text-delta   — { type: "text-delta", delta: "..." }
 *   data-chatMeta — { type: "data-chatMeta", data: { ...ChatResponse } }
 *   error        — { type: "error", errorText: "..." }
 */
async function readChatStream(
  response: Response,
  onChunk: (delta: string) => void
): Promise<ChatResponse> {
  if (!response.body) {
    throw new Error('No response body');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let metadata: ChatResponse = {};
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      // Keep the last (potentially incomplete) line in the buffer
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        // SSE data lines start with "data: "
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6).trim();
        if (!payload || payload === '[DONE]') continue;

        try {
          const event = JSON.parse(payload) as Record<string, unknown>;

          if (event.type === 'text-delta' && typeof event.delta === 'string') {
            if (event.delta) onChunk(event.delta);
          } else if (event.type === 'data-chatMeta' && event.data) {
            metadata = event.data as ChatResponse;
          } else if (event.type === 'error' && typeof event.errorText === 'string') {
            metadata = { error: event.errorText };
          }
        } catch {
          // Ignore malformed SSE lines
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return metadata;
}

interface ChatModelsResponse {
  models?: ChatModelListItem[];
  error?: string;
}

type SelectedChat =
  | { kind: 'persistent'; conversationId: string; mentorId: string | null }
  | { kind: 'draft'; draftId: string; mentorId: string | null }
  | { kind: 'temporary'; tempChatId: string };

interface PendingChatRequest {
  selection: SelectedChat;
  userMessageId: string;
}

interface PersistentDraftChat {
  id: string;
  mentorId: string | null;
  title: 'New chat';
  createdAt: string;
  updatedAt: string;
  messages: Message[];
  branches: ConversationBranch[];
  selectedBranchIds: BranchSelectionMap;
}

type ThreadMetaRecord = Record<string, ThreadMeta[]>;
type ThreadMessagesRecord = Record<string, ThreadMessage[]>;
type ThreadStatusRecord = Record<string, ThreadSessionStatus>;

interface PersistentThreadRuntime {
  threadsMap: ThreadMetaRecord;
  threadMessages: ThreadMessagesRecord;
  threadStatuses: ThreadStatusRecord;
}

interface TemporaryChatSession {
  id: string;
  title: string;
  memoryMode: TemporaryMemoryMode;
  createdAt: string;
  updatedAt: string;
  messages: Message[];
  branches: ConversationBranch[];
  selectedBranchIds: BranchSelectionMap;
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

interface StoredTemporaryChatSession {
  id: string;
  title: string;
  memoryMode: TemporaryMemoryMode;
  createdAt: string;
  updatedAt: string;
  messages: StoredMessage[];
  branches: ConversationBranch[];
  selectedBranchIds: BranchSelectionMap;
  threadsMap: ThreadMetaRecord;
  threadMessages: Record<string, StoredThreadMessage[]>;
  threadStatuses: ThreadStatusRecord;
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

function isSameSelectedChat(a: SelectedChat | null, b: SelectedChat | null) {
  const aKey = getSelectedChatKey(a);
  return aKey !== null && aKey === getSelectedChatKey(b);
}

function mergeReloadedBranchSelections(params: {
  loadedSelectedBranchIds: BranchSelectionMap;
  latestSelectedBranchIds: BranchSelectionMap;
  loadedBranches: ConversationBranch[];
  branchSourceMessageId: string | null;
  pendingBranchSelectionId: string | null;
}) {
  const mergedSelections = { ...params.loadedSelectedBranchIds };
  const validBranchIds = new Set(params.loadedBranches.map((branch) => branch.id));

  for (const [sourceMessageId, branchId] of Object.entries(params.latestSelectedBranchIds)) {
    if (validBranchIds.has(branchId)) {
      mergedSelections[sourceMessageId] = branchId;
    }
  }

  if (
    params.branchSourceMessageId
    && params.pendingBranchSelectionId
    && params.latestSelectedBranchIds[params.branchSourceMessageId]
      === params.pendingBranchSelectionId
  ) {
    const resolvedPendingBranch = [...params.loadedBranches]
      .filter(
        (branch) =>
          branch.sourceMessageId === params.branchSourceMessageId && !branch.isMain
      )
      .sort((a, b) => b.position - a.position)[0];

    if (resolvedPendingBranch) {
      mergedSelections[params.branchSourceMessageId] = resolvedPendingBranch.id;
    }
  }

  return mergedSelections;
}

const TTS_STORAGE_KEY = 'keen-tts-enabled';
const CHAT_MODEL_STORAGE_KEY = 'keen-chat-model';
const TEMP_CHAT_STORAGE_KEY = 'keen-home-temp-chats-v1';
const PERSISTENT_THREAD_RUNTIME_STORAGE_KEY = 'keen-persistent-thread-runtime-v1';
const HOME_SELECTION_HANDOFF_STORAGE_KEY = 'keen-home-selection-handoff-v1';
const TEMP_CHAT_TITLE = 'Temporary chat';

type HomeSelectionHandoff =
  | { kind: 'draft'; draft: PersistentDraftChat }
  | { kind: 'temporary'; tempChatId: string };

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

function serializeTemporaryChats(chats: TemporaryChatSession[]) {
  const serialized: StoredTemporaryChatSession[] = chats.map((chat) => ({
    ...chat,
    messages: chat.messages.map(toStoredMessage),
    threadMessages: Object.fromEntries(
      Object.entries(chat.threadMessages).map(([threadId, messages]) => [
        threadId,
        messages.map(toStoredThreadMessage),
      ])
    ),
  }));

  return JSON.stringify(serialized);
}

function deserializeTemporaryChats(raw: string): TemporaryChatSession[] {
  const parsed = JSON.parse(raw) as StoredTemporaryChatSession[];

  return parsed.map((chat) => ({
    ...chat,
    messages: Array.isArray(chat.messages) ? chat.messages.map(fromStoredMessage) : [],
    branches: Array.isArray(chat.branches) ? chat.branches : [],
    selectedBranchIds: chat.selectedBranchIds || {},
    threadsMap: chat.threadsMap || {},
    threadStatuses: chat.threadStatuses || {},
    threadMessages: Object.fromEntries(
      Object.entries(chat.threadMessages || {}).map(([threadId, messages]) => [
        threadId,
        messages.map(fromStoredThreadMessage),
      ])
    ),
  }));
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

function persistHomeSelectionHandoff(handoff: HomeSelectionHandoff) {
  window.sessionStorage.setItem(
    HOME_SELECTION_HANDOFF_STORAGE_KEY,
    JSON.stringify(handoff)
  );
}

function readHomeSelectionHandoff(): HomeSelectionHandoff | null {
  const stored = window.sessionStorage.getItem(HOME_SELECTION_HANDOFF_STORAGE_KEY);
  if (!stored) {
    return null;
  }

  try {
    return JSON.parse(stored) as HomeSelectionHandoff;
  } catch {
    window.sessionStorage.removeItem(HOME_SELECTION_HANDOFF_STORAGE_KEY);
    return null;
  }
}

function clearHomeSelectionHandoff() {
  window.sessionStorage.removeItem(HOME_SELECTION_HANDOFF_STORAGE_KEY);
}

function sortByUpdatedAtDesc<T extends { updatedAt: string }>(items: T[]) {
  return [...items].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
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
  const [input, setInput] = useState('');
  const [pendingChatRequest, setPendingChatRequest] = useState<PendingChatRequest | null>(
    null
  );
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
  const [lastSearchState, setLastSearchState] = useState<SearchMetadata | null>(null);
  const [persistentMessages, setPersistentMessages] = useState<Message[]>([]);
  const [persistentBranches, setPersistentBranches] = useState<ConversationBranch[]>([]);
  const [persistentSelectedBranchIds, setPersistentSelectedBranchIds] =
    useState<BranchSelectionMap>({});
  const [persistentThreadsMap, setPersistentThreadsMap] = useState<Map<string, ThreadMeta[]>>(
    new Map()
  );
  const [persistentThreadRuntimes, setPersistentThreadRuntimes] =
    useState<PersistentThreadRuntimeRecord>({});
  const [draftChats, setDraftChats] = useState<PersistentDraftChat[]>([]);
  const [temporaryChats, setTemporaryChats] = useState<TemporaryChatSession[]>([]);
  const [selectedChat, setSelectedChat] = useState<SelectedChat | null>(null);
  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  const [sidePanelScrollRequest, setSidePanelScrollRequest] = useState<
    null | 'temporary' | 'new' | 'all'
  >(null);
  const [detailMentorSlug, setDetailMentorSlug] = useState<string | null>(null);
  const [detailPanelOpen, setDetailPanelOpen] = useState(false);
  const [createPanelOpen, setCreatePanelOpen] = useState(false);
  const [pendingBranch, setPendingBranch] = useState<PendingBranchTarget | null>(null);
  const [branchNavigatorOpen, setBranchNavigatorOpen] = useState(false);
  const isLoading = pendingChatRequest !== null;

  const handleToggleSidePanel = useCallback(() => {
    setSidePanelOpen((previousOpen) => !previousOpen);
  }, []);

  const handleCloseSidePanel = useCallback(() => {
    setSidePanelOpen(false);
  }, []);

  useEffect(() => {
    const handleSidePanelShortcut = (event: KeyboardEvent) => {
      if (
        event.repeat
        || event.shiftKey
        || event.altKey
        || (!event.ctrlKey && !event.metaKey)
        || event.key.toLowerCase() !== 'b'
      ) {
        return;
      }

      event.preventDefault();
      handleToggleSidePanel();
    };

    document.addEventListener('keydown', handleSidePanelShortcut);
    return () => document.removeEventListener('keydown', handleSidePanelShortcut);
  }, [handleToggleSidePanel]);

  const { learningMode, toggleLearningMode } = useLearningMode();

  const params = useParams<{ conversationId?: string[] }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const routeConversationId =
    Array.isArray(params.conversationId) && params.conversationId.length > 0
      ? params.conversationId[0]
      : null;
  const e2eQueryParam = searchParams.get('e2e');
  const homeE2eFixture = getHomeE2eFixture(searchParams.get('e2e'));
  const isHomeE2eFixture = homeE2eFixture !== null;

  const {
    mentors,
    conversations,
    mentorGroups,
    loadingLists,
    listError,
    setListError,
    refreshSidebarData,
    loadConversationById,
    loadConversationMessages,
  } = useHomeData();

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
  const activeTemporaryMemoryMode = selectedTemporaryChat?.memoryMode ?? 'use_existing';
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
  const branchNavigatorItems: BranchNavigatorItem[] = activeMessages
    .filter((message) => message.role === 'assistant')
    .map((message) => {
      const chips = branchChipsByMessageId.get(message.id) || [];

      if (chips.length === 0) {
        return null;
      }

      return {
        sourceMessageId: message.id,
        preview: message.content,
        chips,
      };
    })
    .filter((item): item is BranchNavigatorItem => item !== null);
  const activeName = isTemporaryChat
    ? 'Keen'
    : selectedConversation?.mentor_name || activeMentor?.name || 'Keen';
  const isActiveConversationLoading =
    pendingChatRequest !== null
    && isSameSelectedChat(pendingChatRequest.selection, selectedChat)
    && activeMessages.some((message) => message.id === pendingChatRequest.userMessageId);

  const autoSendTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mentorSlugHandledRef = useRef(false);
  const appliedHomeE2eFixtureRef = useRef<string | null>(null);
  const hydratedRouteConversationIdRef = useRef<string | null>(null);
  const routeLoadRequestIdRef = useRef(0);
  const selectedChatRef = useRef<SelectedChat | null>(null);
  const selectedDraftChatRef = useRef<PersistentDraftChat | null>(null);
  const persistentSelectedBranchIdsRef = useRef<BranchSelectionMap>({});
  const persistentThreadRuntimesRef = useRef<PersistentThreadRuntimeRecord>({});
  const draftChatsRef = useRef<PersistentDraftChat[]>([]);
  const threadSessionsRef = useRef<Record<string, ThreadSession>>({});
  const prepareForChatSwitchRef = useRef<(nextSelection: SelectedChat | null) => void>(
    () => {}
  );

  // Keep refs aligned with latest render (draft promotion + branch merge reads these).
  selectedChatRef.current = selectedChat;
  persistentSelectedBranchIdsRef.current = persistentSelectedBranchIds;
  persistentThreadRuntimesRef.current = persistentThreadRuntimes;
  draftChatsRef.current = draftChats;
  threadSessionsRef.current = threadSessionsById;

  useEffect(() => {
    if (isHomeE2eFixture) {
      return;
    }

    const stored = window.sessionStorage.getItem(TEMP_CHAT_STORAGE_KEY);
    if (!stored) {
      return;
    }

    try {
      setTemporaryChats(sortByUpdatedAtDesc(deserializeTemporaryChats(stored)));
    } catch (error) {
      console.error('Failed to restore temporary chats:', error);
      window.sessionStorage.removeItem(TEMP_CHAT_STORAGE_KEY);
    }
  }, [isHomeE2eFixture]);

  useEffect(() => {
    if (isHomeE2eFixture) {
      return;
    }

    if (temporaryChats.length === 0) {
      window.sessionStorage.removeItem(TEMP_CHAT_STORAGE_KEY);
      return;
    }

    window.sessionStorage.setItem(
      TEMP_CHAT_STORAGE_KEY,
      serializeTemporaryChats(temporaryChats)
    );
  }, [isHomeE2eFixture, temporaryChats]);

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
    if (routeConversationId || selectedChat) {
      return;
    }

    const handoff = readHomeSelectionHandoff();
    if (!handoff) {
      return;
    }

    if (handoff.kind === 'temporary') {
      const matchingTempChat = temporaryChats.find(
        (chat) => chat.id === handoff.tempChatId
      );
      if (!matchingTempChat) {
        return;
      }

      const nextSelection: SelectedChat = {
        kind: 'temporary',
        tempChatId: handoff.tempChatId,
      };

      selectedChatRef.current = nextSelection;
      setSelectedChat(nextSelection);
      clearHomeSelectionHandoff();
      return;
    }

    const nextSelection: SelectedChat = {
      kind: 'draft',
      draftId: handoff.draft.id,
      mentorId: handoff.draft.mentorId,
    };

    setDraftChats((prev) => {
      if (prev.some((draft) => draft.id === handoff.draft.id)) {
        return prev;
      }

      return [handoff.draft, ...prev];
    });
    selectedChatRef.current = nextSelection;
    setSelectedChat(nextSelection);
    clearHomeSelectionHandoff();
  }, [draftChats, routeConversationId, selectedChat, temporaryChats]);

  useEffect(() => {
    if (isHomeE2eFixture) {
      return;
    }
    void refreshSidebarData();
  }, [isHomeE2eFixture, refreshSidebarData]);

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
    if (branchNavigatorItems.length === 0 && branchNavigatorOpen) {
      setBranchNavigatorOpen(false);
    }
  }, [branchNavigatorItems.length, branchNavigatorOpen]);

  useEffect(() => {
    if (isHomeE2eFixture || mentorSlugHandledRef.current || routeConversationId) return;
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
    routeConversationId,
    searchParams,
    loadingLists,
    mentors,
    conversations,
    router,
    listError,
    isHomeE2eFixture,
  ]);

  const scrollToBottom = useCallback(() => {
    if (!userHasScrolled && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [userHasScrolled]);

  useEffect(() => {
    scrollToBottom();
  }, [activeMessages, scrollToBottom]);

  const handleScroll = () => {
    const container = containerRef.current;
    if (!container) return;
    const isAtBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < 100;
    setUserHasScrolled(!isAtBottom);
  };

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
    setInput('');
    setPendingChatRequest(null);
    setLastSearchState(null);
    setUserHasScrolled(false);
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
          memoryMode: 'use_existing',
          createdAt: now,
          updatedAt: now,
          messages: homeE2eFixture.messages,
          branches: [],
          selectedBranchIds: {},
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
    setPersistentBranches([]);
    setPersistentSelectedBranchIds({});
    setPersistentThreadsMap(buildFixtureThreadsMap(homeE2eFixture.threads || []));
    setSelectedChat({
      kind: 'persistent',
      conversationId:
        homeE2eFixture.conversationId ?? `fixture-${homeE2eFixture.key}`,
      mentorId: null,
    });
  }, [
    homeE2eFixture,
    resetThreadUi,
    setListError,
    stopMic,
    tts,
  ]);

  const createDraft = useCallback((mentorId: string | null): PersistentDraftChat => {
    const now = new Date().toISOString();

    return {
      id: createTemporaryId('draft'),
      mentorId,
      title: 'New chat',
      createdAt: now,
      updatedAt: now,
      messages: [],
      branches: [],
      selectedBranchIds: {},
    };
  }, []);

  const getOrCreateDraft = useCallback(
    (mentorId: string | null) => {
      const existing = draftChats.find((draft) => draft.mentorId === mentorId);
      if (existing) {
        return existing;
      }

      const draft = createDraft(mentorId);
      setDraftChats((prev) => [draft, ...prev]);
      return draft;
    },
    [createDraft, draftChats]
  );

  const updateDraftChat = useCallback(
    (
      draftId: string,
      updater: (draft: PersistentDraftChat) => PersistentDraftChat
    ) => {
      setDraftChats((prev) =>
        prev.map((draft) => (draft.id === draftId ? updater(draft) : draft))
      );
    },
    []
  );

  const updateTemporaryChat = useCallback(
    (
      tempChatId: string,
      updater: (chat: TemporaryChatSession) => TemporaryChatSession
    ) => {
      setTemporaryChats((prev) =>
        sortByUpdatedAtDesc(
          prev.map((chat) => (chat.id === tempChatId ? updater(chat) : chat))
        )
      );
    },
    []
  );

  const prepareForChatSwitch = useCallback(
    (nextSelection: SelectedChat | null) => {
      tts.stop();
      stopMic();
    resetThreadUi();
    setPendingBranch(null);
    setBranchNavigatorOpen(false);
    setInput('');
    setLastSearchState(null);
    setUserHasScrolled(false);

      const currentSelection = selectedChatRef.current;
      const currentDraft = selectedDraftChatRef.current;

      if (
        currentSelection?.kind === 'draft' &&
        currentDraft &&
        currentDraft.messages.length === 0 &&
        !(
          nextSelection?.kind === 'draft' &&
          nextSelection.draftId === currentDraft.id
        )
      ) {
        setDraftChats((prev) =>
          prev.filter((draft) => draft.id !== currentDraft.id)
        );
      }
    },
    [resetThreadUi, stopMic, tts]
  );

  useEffect(() => {
    prepareForChatSwitchRef.current = prepareForChatSwitch;
  }, [prepareForChatSwitch]);

  const buildHomeHref = useCallback(
    (pathname: string) => {
      if (!e2eQueryParam) {
        return pathname;
      }

      const separator = pathname.includes('?') ? '&' : '?';
      return `${pathname}${separator}e2e=${encodeURIComponent(e2eQueryParam)}`;
    },
    [e2eQueryParam]
  );

  const openHomeWorkspace = useCallback(() => {
    if (!routeConversationId) {
      return;
    }

    router.push(buildHomeHref('/home'), { scroll: false });
  }, [buildHomeHref, routeConversationId, router]);

  const openPersistentConversation = useCallback(
    (conversationId: string, options?: { replace?: boolean }) => {
      const href = buildHomeHref(`/home/${encodeURIComponent(conversationId)}`);

      if (options?.replace) {
        router.replace(href, { scroll: false });
        return;
      }

      router.push(href, { scroll: false });
    },
    [buildHomeHref, router]
  );

  const handleCreateDraftSelection = useCallback(
    (mentorId: string | null) => {
      const draft = getOrCreateDraft(mentorId);
      const nextSelection: SelectedChat = {
        kind: 'draft',
        draftId: draft.id,
        mentorId,
      };

      prepareForChatSwitch(nextSelection);
      setPersistentMessages([]);
      setPersistentBranches([]);
      setPersistentSelectedBranchIds({});
      setPersistentThreadsMap(new Map());
      if (routeConversationId) {
        persistHomeSelectionHandoff({
          kind: 'draft',
          draft,
        });
      }
      selectedChatRef.current = nextSelection;
      setSelectedChat(nextSelection);
      openHomeWorkspace();
    },
    [getOrCreateDraft, openHomeWorkspace, prepareForChatSwitch, routeConversationId]
  );

  const handleCreateTemporaryChat = useCallback(() => {
    const now = new Date().toISOString();
    const chat: TemporaryChatSession = {
      id: createTemporaryId('temporary-chat'),
      title: TEMP_CHAT_TITLE,
      memoryMode: 'use_existing',
      createdAt: now,
      updatedAt: now,
      messages: [],
      branches: [],
      selectedBranchIds: {},
      threadsMap: {},
      threadMessages: {},
      threadStatuses: {},
    };

    const nextSelection: SelectedChat = {
      kind: 'temporary',
      tempChatId: chat.id,
    };

    prepareForChatSwitch(nextSelection);
    setPersistentMessages([]);
    setPersistentBranches([]);
    setPersistentSelectedBranchIds({});
    setPersistentThreadsMap(new Map());
    setTemporaryChats((prev) => [chat, ...prev]);
    if (routeConversationId) {
      persistHomeSelectionHandoff({
        kind: 'temporary',
        tempChatId: chat.id,
      });
    }
    selectedChatRef.current = nextSelection;
    setSelectedChat(nextSelection);
    openHomeWorkspace();
  }, [openHomeWorkspace, prepareForChatSwitch, routeConversationId]);

  const handleRailNewChatKeen = useCallback(() => {
    handleCreateDraftSelection(null);
    setSidePanelScrollRequest('new');
    setSidePanelOpen(true);
  }, [handleCreateDraftSelection]);

  const handleRailOpenTemporarySection = useCallback(() => {
    setSidePanelScrollRequest('temporary');
    setSidePanelOpen(true);
  }, []);

  const handleRailOpenAllChats = useCallback(() => {
    setSidePanelScrollRequest('all');
    setSidePanelOpen(true);
  }, []);

  useEffect(() => {
    if (!sidePanelOpen || !sidePanelScrollRequest) {
      return;
    }

    const run = () => {
      const scrollEl = document.getElementById('side-panel-scroll');
      if (!scrollEl) {
        return;
      }

      const sectionId =
        sidePanelScrollRequest === 'temporary'
          ? 'side-panel-section-temporary'
          : sidePanelScrollRequest === 'new'
            ? 'side-panel-section-new'
            : 'side-panel-section-all-chats';
      document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

      setSidePanelScrollRequest(null);
    };

    requestAnimationFrame(() => requestAnimationFrame(run));
  }, [sidePanelOpen, sidePanelScrollRequest]);

  const handleSelectTemporaryChat = useCallback(
    (tempChatId: string) => {
      const nextSelection: SelectedChat = {
        kind: 'temporary',
        tempChatId,
      };

      prepareForChatSwitch(nextSelection);
      setPersistentMessages([]);
      setPersistentBranches([]);
      setPersistentSelectedBranchIds({});
      setPersistentThreadsMap(new Map());
      if (routeConversationId) {
        persistHomeSelectionHandoff({
          kind: 'temporary',
          tempChatId,
        });
      }
      selectedChatRef.current = nextSelection;
      setSelectedChat(nextSelection);
      openHomeWorkspace();
    },
    [openHomeWorkspace, prepareForChatSwitch, routeConversationId]
  );

  const handleSelectDraft = useCallback(
    (draftId: string) => {
      const draft = draftChats.find((entry) => entry.id === draftId);
      if (!draft) {
        return;
      }

      const nextSelection: SelectedChat = {
        kind: 'draft',
        draftId,
        mentorId: draft.mentorId,
      };

      prepareForChatSwitch(nextSelection);
      setPersistentMessages([]);
      setPersistentBranches([]);
      setPersistentSelectedBranchIds({});
      setPersistentThreadsMap(new Map());
      if (routeConversationId) {
        persistHomeSelectionHandoff({
          kind: 'draft',
          draft,
        });
      }
      selectedChatRef.current = nextSelection;
      setSelectedChat(nextSelection);
      openHomeWorkspace();
    },
    [draftChats, openHomeWorkspace, prepareForChatSwitch, routeConversationId]
  );

  const handleSelectConversation = useCallback(
    (conversation: ConversationListItem) => {
      openPersistentConversation(conversation.id);
    },
    [openPersistentConversation]
  );

  useEffect(() => {
    if (isHomeE2eFixture) {
      return;
    }

    const currentSelectedChat = selectedChatRef.current;
    const currentPersistentSelection =
      currentSelectedChat?.kind === 'persistent' ? currentSelectedChat : null;

    if (!routeConversationId) {
      hydratedRouteConversationIdRef.current = null;

      if (currentPersistentSelection) {
        prepareForChatSwitchRef.current(null);
        selectedChatRef.current = null;
        setSelectedChat(null);
        setPersistentMessages([]);
        setPersistentThreadsMap(new Map());
      }

      return;
    }

    const alreadyHydrated =
      hydratedRouteConversationIdRef.current === routeConversationId &&
      currentPersistentSelection?.conversationId === routeConversationId;

    if (alreadyHydrated) {
      return;
    }

    const requestId = routeLoadRequestIdRef.current + 1;
    routeLoadRequestIdRef.current = requestId;

    const loadSelectedConversation = async () => {
      const loadedConversation = await loadConversationById(routeConversationId);

      if (routeLoadRequestIdRef.current !== requestId) {
        return;
      }

      const nextSelection: SelectedChat = {
        kind: 'persistent',
        conversationId: routeConversationId,
        mentorId: loadedConversation.mentor_id,
      };

      prepareForChatSwitchRef.current(nextSelection);
      setSelectedChat(nextSelection);
      setPersistentMessages([]);
      setPersistentBranches([]);
      setPersistentSelectedBranchIds({});
      setPersistentThreadsMap(new Map());
      setListError(null);

      const loadedConversationData = await loadConversationMessages(routeConversationId);

      if (routeLoadRequestIdRef.current !== requestId) {
        return;
      }

      hydratedRouteConversationIdRef.current = routeConversationId;
      setPersistentMessages(loadedConversationData.messages);
      setPersistentBranches(loadedConversationData.branches);
      setPersistentSelectedBranchIds(loadedConversationData.selectedBranchIds);
      setPersistentThreadsMap(loadedConversationData.threadsMap);
    };

    void loadSelectedConversation().catch((err) => {
      if (routeLoadRequestIdRef.current !== requestId) {
        return;
      }

      hydratedRouteConversationIdRef.current = null;
      prepareForChatSwitchRef.current({
        kind: 'persistent',
        conversationId: routeConversationId,
        mentorId: null,
      });
      setListError(err instanceof Error ? err.message : 'Failed to load conversation');
      setSelectedChat({
        kind: 'persistent',
        conversationId: routeConversationId,
        mentorId: null,
      });
      setPersistentMessages([]);
      setPersistentThreadsMap(new Map());
    });
  }, [
    isHomeE2eFixture,
    loadConversationById,
    loadConversationMessages,
    routeConversationId,
  ]);

  const handleCloseTemporaryChat = useCallback(
    (tempChatId: string) => {
      const remaining = temporaryChats.filter((chat) => chat.id !== tempChatId);
      setTemporaryChats(remaining);

      if (
        selectedChat?.kind !== 'temporary' ||
        selectedChat.tempChatId !== tempChatId
      ) {
        return;
      }

      const nextTempChat = remaining[0];
      if (nextTempChat) {
        handleSelectTemporaryChat(nextTempChat.id);
        return;
      }

      const latestConversation = conversations[0];
      if (latestConversation) {
        handleSelectConversation(latestConversation);
        return;
      }

      prepareForChatSwitch(null);
      setSelectedChat(null);
      setPersistentMessages([]);
      setPersistentBranches([]);
      setPersistentSelectedBranchIds({});
      setPersistentThreadsMap(new Map());
    },
    [
      conversations,
      handleSelectConversation,
      handleSelectTemporaryChat,
      prepareForChatSwitch,
      selectedChat,
      temporaryChats,
    ]
  );

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
    (draftId: string, sourceMessageId: string, branchId: string) => {
      updateDraftChat(draftId, (draft) => ({
        ...draft,
        selectedBranchIds: {
          ...draft.selectedBranchIds,
          [sourceMessageId]: branchId,
        },
      }));
    },
    [updateDraftChat]
  );

  const updateActiveBranchSelection = useCallback(
    (sourceMessageId: string, branchId: string) => {
      if (selectedChat?.kind === 'temporary') {
        updateTemporaryChat(selectedChat.tempChatId, (chat) => ({
          ...chat,
          selectedBranchIds: {
            ...chat.selectedBranchIds,
            [sourceMessageId]: branchId,
          },
        }));
        return;
      }

      if (selectedChat?.kind === 'draft') {
        updateDraftBranchSelection(selectedChat.draftId, sourceMessageId, branchId);
        return;
      }

      if (selectedChat?.kind === 'persistent') {
        setPersistentSelectedBranchIds((prev) => ({
          ...prev,
          [sourceMessageId]: branchId,
        }));
      }
    },
    [selectedChat, updateDraftBranchSelection, updateTemporaryChat]
  );

  const handleCreateBranch = useCallback((sourceMessageId: string) => {
    setPendingBranch(createPendingBranchTarget(sourceMessageId));
    setUserHasScrolled(false);
  }, []);

  const jumpToMessage = useCallback((messageId: string) => {
    const selector =
      typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
        ? `[data-message-id="${CSS.escape(messageId)}"]`
        : `[data-message-id="${messageId.replace(/["\\]/g, '\\$&')}"]`;

    setUserHasScrolled(true);

    const scrollToTarget = () => {
      const target = containerRef.current?.querySelector<HTMLElement>(selector);
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(scrollToTarget);
      return;
    }

    scrollToTarget();
  }, []);

  const handleSelectBranch = useCallback(
    (sourceMessageId: string, branchId: string | null) => {
      if (branchId) {
        updateActiveBranchSelection(sourceMessageId, branchId);
      }

      if (pendingBranch?.sourceMessageId === sourceMessageId) {
        setPendingBranch(null);
      }

      setUserHasScrolled(false);
    },
    [pendingBranch, updateActiveBranchSelection]
  );

  const handleSelectBranchFromNavigator = useCallback(
    (sourceMessageId: string, branchId: string | null) => {
      handleSelectBranch(sourceMessageId, branchId);
      jumpToMessage(sourceMessageId);
    },
    [handleSelectBranch, jumpToMessage]
  );

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isLoading) return;

    if (autoSendTimerRef.current) {
      clearTimeout(autoSendTimerRef.current);
      autoSendTimerRef.current = null;
    }
    transcription.clearTranscript();

    const now = new Date();
    const nextUpdatedAt = now.toISOString();
    const messageText = content.trim();

    let effectiveSelection = selectedChat;
    let effectiveDraft = selectedDraftChat;
    let effectiveTempChat = selectedTemporaryChat;
    const effectivePendingBranch = pendingBranch;
    const activePathTailMessageId = activeMessages[activeMessages.length - 1]?.id ?? null;
    const previousMessageId = effectivePendingBranch?.sourceMessageId ?? activePathTailMessageId;
    const branchSourceMessageId = effectivePendingBranch?.sourceMessageId ?? null;

    if (!effectiveSelection) {
      effectiveDraft = getOrCreateDraft(null);
      effectiveSelection = {
        kind: 'draft',
        draftId: effectiveDraft.id,
        mentorId: null,
      };
      setSelectedChat(effectiveSelection);
    }

    const userMessage: Message = {
      id:
        effectiveSelection.kind === 'temporary'
          ? createTemporaryId('message')
          : Date.now().toString(),
      role: 'user',
      content: messageText,
      timestamp: now,
      previousMessageId,
    };

    const temporaryNextTree =
      effectiveSelection.kind === 'temporary' && effectiveTempChat
        ? applyUserMessageToTree({
            messages: effectiveTempChat.messages,
            branches: effectiveTempChat.branches,
            selectedBranchIds: effectiveTempChat.selectedBranchIds,
            pendingBranch: effectivePendingBranch,
            userMessage,
          })
        : null;
    const persistentNextTree =
      effectiveSelection.kind === 'persistent'
        ? applyUserMessageToTree({
            messages: persistentMessages,
            branches: persistentBranches,
            selectedBranchIds: persistentSelectedBranchIds,
            pendingBranch: effectivePendingBranch,
            userMessage,
          })
        : null;
    const draftNextTree =
      effectiveSelection.kind === 'draft' && effectiveDraft
        ? applyUserMessageToTree({
            messages: effectiveDraft.messages,
            branches: effectiveDraft.branches,
            selectedBranchIds: effectiveDraft.selectedBranchIds,
            pendingBranch: effectivePendingBranch,
            userMessage,
          })
        : null;
    const pendingBranchSelectionId =
      branchSourceMessageId && effectivePendingBranch
        ? temporaryNextTree?.selectedBranchIds[branchSourceMessageId]
          ?? persistentNextTree?.selectedBranchIds[branchSourceMessageId]
          ?? draftNextTree?.selectedBranchIds[branchSourceMessageId]
          ?? null
        : null;

    if (effectiveSelection.kind === 'temporary') {
      updateTemporaryChat(effectiveSelection.tempChatId, (chat) => {
        const nextTree = temporaryNextTree;
        if (!nextTree) {
          return chat;
        }

        return {
          ...chat,
          messages: nextTree.messages,
          branches: nextTree.branches,
          selectedBranchIds: nextTree.selectedBranchIds,
          updatedAt: nextUpdatedAt,
        };
      });
    } else if (effectiveSelection.kind === 'persistent') {
      const nextTree = persistentNextTree;
      if (!nextTree) {
        return;
      }
      setPersistentMessages(nextTree.messages);
      setPersistentBranches(nextTree.branches);
      setPersistentSelectedBranchIds(nextTree.selectedBranchIds);
    } else {
      const draft = effectiveDraft || getOrCreateDraft(effectiveSelection.mentorId);
      effectiveDraft = draft;
      const nextTree = draftNextTree;
      if (!nextTree) {
        return;
      }
      updateDraftChat(draft.id, (currentDraft) => {
        return {
          ...currentDraft,
          messages: nextTree.messages,
          branches: nextTree.branches,
          selectedBranchIds: nextTree.selectedBranchIds,
          updatedAt: nextUpdatedAt,
        };
      });
    }

    setPendingBranch(null);
    setInput('');
    setPendingChatRequest({
      selection: effectiveSelection,
      userMessageId: userMessage.id,
    });
    setLastSearchState(null);
    setUserHasScrolled(false);

    // Optimistic streaming message — shown immediately, content grows as chunks arrive.
    const streamingMessageId =
      effectiveSelection.kind === 'temporary'
        ? createTemporaryId('message')
        : `streaming-${Date.now()}`;
    const streamingMessage: Message = {
      id: streamingMessageId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      previousMessageId: userMessage.id,
      isStreaming: true,
    };

    const addStreamingMessage = <T extends { messages: Message[] }>(chat: T): T => ({
      ...chat,
      messages: [...chat.messages, streamingMessage],
    });

    if (effectiveSelection.kind === 'temporary') {
      updateTemporaryChat(effectiveSelection.tempChatId, (chat) => ({
        ...addStreamingMessage(chat),
        updatedAt: new Date().toISOString(),
      }));
    } else if (effectiveSelection.kind === 'persistent') {
      if (isSameSelectedChat(selectedChatRef.current, effectiveSelection)) {
        setPersistentMessages((prev) => [...prev, streamingMessage]);
      }
    } else if (effectiveDraft) {
      updateDraftChat(effectiveDraft.id, (draft) => addStreamingMessage(draft));
    }

    // Append each text delta to the streaming message in state.
    const appendChunk = (delta: string) => {
      if (effectiveSelection.kind === 'temporary') {
        updateTemporaryChat(effectiveSelection.tempChatId, (chat) => ({
          ...chat,
          messages: chat.messages.map((m) =>
            m.id === streamingMessageId ? { ...m, content: m.content + delta } : m
          ),
        }));
      } else if (effectiveSelection.kind === 'persistent') {
        if (isSameSelectedChat(selectedChatRef.current, effectiveSelection)) {
          setPersistentMessages((prev) =>
            prev.map((m) =>
              m.id === streamingMessageId ? { ...m, content: m.content + delta } : m
            )
          );
        }
      } else if (effectiveDraft) {
        updateDraftChat(effectiveDraft.id, (draft) => ({
          ...draft,
          messages: draft.messages.map((m) =>
            m.id === streamingMessageId ? { ...m, content: m.content + delta } : m
          ),
        }));
      }
    };

    // Remove the temporary streaming message and replace it with the final committed one.
    const replaceStreamingMessage = (finalMessage: Message) => {
      if (effectiveSelection.kind === 'temporary') {
        updateTemporaryChat(effectiveSelection.tempChatId, (chat) => ({
          ...chat,
          messages: chat.messages.map((m) =>
            m.id === streamingMessageId ? finalMessage : m
          ),
        }));
      } else if (effectiveSelection.kind === 'persistent') {
        if (isSameSelectedChat(selectedChatRef.current, effectiveSelection)) {
          setPersistentMessages((prev) =>
            prev.map((m) => (m.id === streamingMessageId ? finalMessage : m))
          );
        }
      } else if (effectiveDraft) {
        updateDraftChat(effectiveDraft.id, (draft) => ({
          ...draft,
          messages: draft.messages.map((m) =>
            m.id === streamingMessageId ? finalMessage : m
          ),
        }));
      }
    };

    // Remove the streaming placeholder entirely (used on error paths).
    const removeStreamingMessage = () => {
      if (effectiveSelection.kind === 'temporary') {
        updateTemporaryChat(effectiveSelection.tempChatId, (chat) => ({
          ...chat,
          messages: chat.messages.filter((m) => m.id !== streamingMessageId),
        }));
      } else if (effectiveSelection.kind === 'persistent') {
        if (isSameSelectedChat(selectedChatRef.current, effectiveSelection)) {
          setPersistentMessages((prev) => prev.filter((m) => m.id !== streamingMessageId));
        }
      } else if (effectiveDraft) {
        updateDraftChat(effectiveDraft.id, (draft) => ({
          ...draft,
          messages: draft.messages.filter((m) => m.id !== streamingMessageId),
        }));
      }
    };

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: messageText,
          conversationId:
            effectiveSelection.kind === 'persistent'
              ? effectiveSelection.conversationId
              : undefined,
          mentorId:
            effectiveSelection.kind === 'temporary'
              ? undefined
              : effectiveSelection.mentorId ?? undefined,
          modelId: selectedModelId,
          previousMessageId,
          branchSourceMessageId: branchSourceMessageId ?? undefined,
          searchEnabled,
          timezone: getBrowserTimeZone(),
          chatMode:
            effectiveSelection.kind === 'temporary' ? 'temporary' : 'persistent',
          ...(effectiveSelection.kind === 'temporary'
            ? {
                memoryMode: effectiveTempChat?.memoryMode ?? 'use_existing',
                history: toChatHistory(activeMessages),
              }
            : {}),
        }),
      });

      if (!response.ok) {
        // Non-streaming error response (e.g. 401, 500 before stream starts)
        const data = (await response.json()) as ChatResponse;
        removeStreamingMessage();
        const errorMessage: Message = {
          id:
            effectiveSelection.kind === 'temporary'
              ? createTemporaryId('message')
              : (Date.now() + 1).toString(),
          role: 'assistant',
          content: `Something went wrong. ${data.error || ''}`.trim(),
          timestamp: new Date(),
          previousMessageId: userMessage.id,
        };

        if (effectiveSelection.kind === 'temporary') {
          updateTemporaryChat(effectiveSelection.tempChatId, (chat) => ({
            ...chat,
            messages: [...chat.messages, errorMessage],
            updatedAt: new Date().toISOString(),
          }));
        } else if (effectiveSelection.kind === 'persistent') {
          if (isSameSelectedChat(selectedChatRef.current, effectiveSelection)) {
            setPersistentMessages((prev) => [...prev, errorMessage]);
          }
        } else if (effectiveDraft) {
          updateDraftChat(effectiveDraft.id, (draft) => ({
            ...draft,
            messages: [...draft.messages, errorMessage],
            updatedAt: new Date().toISOString(),
          }));
        }
        return;
      }

      const data = await readChatStream(response, appendChunk);
      logResolvedChatModel(data, 'composer');

      if (data.error) {
        removeStreamingMessage();
        const errorMessage: Message = {
          id:
            effectiveSelection.kind === 'temporary'
              ? createTemporaryId('message')
              : (Date.now() + 1).toString(),
          role: 'assistant',
          content: `Something went wrong. ${data.error}`.trim(),
          timestamp: new Date(),
          previousMessageId: userMessage.id,
        };

        if (effectiveSelection.kind === 'temporary') {
          updateTemporaryChat(effectiveSelection.tempChatId, (chat) => ({
            ...chat,
            messages: [...chat.messages, errorMessage],
            updatedAt: new Date().toISOString(),
          }));
        } else if (effectiveSelection.kind === 'persistent') {
          if (isSameSelectedChat(selectedChatRef.current, effectiveSelection)) {
            setPersistentMessages((prev) => [...prev, errorMessage]);
          }
        } else if (effectiveDraft) {
          updateDraftChat(effectiveDraft.id, (draft) => ({
            ...draft,
            messages: [...draft.messages, errorMessage],
            updatedAt: new Date().toISOString(),
          }));
        }
        return;
      }

      setLastSearchState(data.search ?? null);

      const responseText =
        data.message?.trim() || 'Something went wrong. The assistant returned an empty response.';
      const assistantMessage: Message = {
        id:
          effectiveSelection.kind === 'temporary'
            ? streamingMessageId
            : data.assistantMessageId || (Date.now() + 1).toString(),
        role: 'assistant',
        content: responseText,
        timestamp: new Date(),
        searchMetadata: data.search?.metadata ?? null,
        previousMessageId: data.userMessageId || userMessage.id,
        isStreaming: false,
      };

      // Replace the streaming placeholder with the final message (correct ID + metadata).
      replaceStreamingMessage(assistantMessage);

      if (effectiveSelection.kind === 'temporary') {
        updateTemporaryChat(effectiveSelection.tempChatId, (chat) => ({
          ...chat,
          title:
            data.conversationTitle ||
            fallbackChatTitleFromMessage(messageText, TEMP_CHAT_TITLE),
          updatedAt: new Date().toISOString(),
        }));
      } else if (effectiveSelection.kind === 'persistent') {
        if (isSameSelectedChat(selectedChatRef.current, effectiveSelection)) {
          const loadedConversation = await loadConversationMessages(
            effectiveSelection.conversationId
          );

          if (isSameSelectedChat(selectedChatRef.current, effectiveSelection)) {
            const mergedSelections = mergeReloadedBranchSelections({
              loadedSelectedBranchIds: loadedConversation.selectedBranchIds,
              latestSelectedBranchIds: persistentSelectedBranchIdsRef.current,
              loadedBranches: loadedConversation.branches,
              branchSourceMessageId,
              pendingBranchSelectionId,
            });

            setPersistentMessages(loadedConversation.messages);
            setPersistentBranches(loadedConversation.branches);
            setPersistentSelectedBranchIds(mergedSelections);
            setPersistentThreadsMap(loadedConversation.threadsMap);
          }
        }

        if (!isHomeE2eFixture) {
          await refreshSidebarData();
        }
      } else if (effectiveDraft && data.conversationId) {
        const nextPersistentSelection: SelectedChat = {
          kind: 'persistent',
          conversationId: data.conversationId,
          mentorId: effectiveDraft.mentorId,
        };
        const latestDraftSelections =
          draftChatsRef.current.find((draft) => draft.id === effectiveDraft.id)
            ?.selectedBranchIds ?? effectiveDraft.selectedBranchIds;

        if (isSameSelectedChat(selectedChatRef.current, effectiveSelection)) {
          const loadedConversation = await loadConversationMessages(data.conversationId);

          if (isSameSelectedChat(selectedChatRef.current, effectiveSelection)) {
            const mergedSelections = mergeReloadedBranchSelections({
              loadedSelectedBranchIds: loadedConversation.selectedBranchIds,
              latestSelectedBranchIds: latestDraftSelections,
              loadedBranches: loadedConversation.branches,
              branchSourceMessageId,
              pendingBranchSelectionId,
            });

            setPersistentMessages(loadedConversation.messages);
            setPersistentBranches(loadedConversation.branches);
            setPersistentSelectedBranchIds(mergedSelections);
            setPersistentThreadsMap(loadedConversation.threadsMap);
            setSelectedChat(nextPersistentSelection);
          }
        }

        setDraftChats((prev) => prev.filter((draft) => draft.id !== effectiveDraft!.id));
        hydratedRouteConversationIdRef.current = data.conversationId;
        setSelectedChat(nextPersistentSelection);
        openPersistentConversation(data.conversationId, { replace: true });
        if (!isHomeE2eFixture) {
          await refreshSidebarData();
        }
      }

      if (ttsEnabled && responseText && !responseText.startsWith('Something went wrong')) {
        tts.speak(stripCitationMarkers(responseText, assistantMessage.searchMetadata));
      }
    } catch {
      // Replace the streaming placeholder with a static error message.
      replaceStreamingMessage({
        id:
          effectiveSelection.kind === 'temporary'
            ? streamingMessageId
            : (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Sorry, there was an error processing your message.',
        timestamp: new Date(),
        previousMessageId: userMessage.id,
        isStreaming: false,
      });
    } finally {
      setPendingChatRequest(null);
    }
  }, [
    getOrCreateDraft,
    isLoading,
    loadConversationMessages,
    selectedModelId,
    isHomeE2eFixture,
    refreshSidebarData,
    searchEnabled,
    pendingBranch,
    persistentBranches,
    persistentMessages,
    persistentSelectedBranchIds,
    selectedChat,
    selectedDraftChat,
    selectedTemporaryChat,
    transcription,
    tts,
    ttsEnabled,
    updateDraftChat,
    updateTemporaryChat,
    openPersistentConversation,
    activeMessages,
  ]);

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
    <div className="relative flex h-dvh min-h-0 flex-col overflow-hidden bg-background text-foreground">
      <HomeBackground />

      <main
        className={`relative flex min-h-0 flex-1 flex-col transition-[padding] duration-300 ease-out ${
          sidePanelOpen ? 'pl-[min(27.25rem,100vw)]' : 'pl-14'
        } ${threadPanelOpen ? 'lg:pr-[460px]' : ''}`}
      >
        <div className="w-full shrink-0 px-6">
          <HomeHeader
            activeName={activeName}
            isTemporaryChat={isTemporaryChat}
            temporaryMemoryMode={activeTemporaryMemoryMode}
            onBrowseMentors={() => router.push('/mentors')}
            onCreateTemporaryChat={handleCreateTemporaryChat}
          />
        </div>

        <div
          data-testid="home-scroll-container"
          ref={containerRef}
          onScroll={handleScroll}
          className="relative min-h-0 flex-1 overflow-y-auto"
          style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(0,0,0,0.08) transparent' }}
        >
          <BranchNavigator
            items={branchNavigatorItems}
            isOpen={branchNavigatorOpen}
            onToggle={() => setBranchNavigatorOpen((prev) => !prev)}
            onClose={() => setBranchNavigatorOpen(false)}
            onJumpToMessage={jumpToMessage}
            onSelectBranch={handleSelectBranchFromNavigator}
          />
          <ConversationView
            loadingLists={loadingLists}
            listError={listError}
            messages={activeMessages}
            activeName={activeName}
            emptyTitle={emptyTitle}
            emptySubtitle={emptySubtitle}
            isLoading={isActiveConversationLoading}
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
          searchWarning={lastSearchState?.warning ?? null}
          isTtsLoading={tts.isLoading}
          isTtsPlaying={tts.isPlaying}
          textareaRef={textareaRef}
          waveformRef={visualization.lineRef}
          waveformGlowRef={visualization.glowRef}
          waveformContainerRef={visualization.visualRef}
          onInputChange={setInput}
          onModelChange={setSelectedModelId}
          onToggleMic={toggleMic}
          onToggleTts={toggleTtsEnabled}
          onToggleSearch={() => setSearchEnabled((prev) => !prev)}
          onToggleLearningMode={toggleLearningMode}
          onTemporaryMemoryModeChange={updateSelectedTemporaryMemoryMode}
          onSubmit={handleSubmit}
          onKeyDown={handleKeyDown}
        />
      </main>

      <SidePanel
        isOpen={sidePanelOpen}
        onClose={handleCloseSidePanel}
        onToggleSidePanel={handleToggleSidePanel}
        onNewChatKeen={handleRailNewChatKeen}
        onOpenTemporarySection={handleRailOpenTemporarySection}
        onOpenAllChats={handleRailOpenAllChats}
        mentorGroups={mentorGroups}
        draftChats={draftChats.map((draft) => ({
          id: draft.id,
          mentor_id: draft.mentorId,
          title: draft.title,
          updated_at: draft.updatedAt,
        }))}
        temporaryChats={temporaryChats.map((chat) => ({
          id: chat.id,
          title: chat.title,
          updated_at: chat.updatedAt,
        }))}
        selectedConversationId={
          selectedChat?.kind === 'persistent' ? selectedChat.conversationId : null
        }
        selectedDraftId={selectedChat?.kind === 'draft' ? selectedChat.draftId : null}
        selectedTempChatId={
          selectedChat?.kind === 'temporary' ? selectedChat.tempChatId : null
        }
        selectedMentorId={
          selectedChat?.kind === 'temporary' ? null : selectedChat?.mentorId ?? null
        }
        onSelectConversation={(conversation) => {
          void handleSelectConversation(conversation);
          handleCloseSidePanel();
        }}
        onSelectDraft={(draftId) => {
          handleSelectDraft(draftId);
          handleCloseSidePanel();
        }}
        onSelectTemporaryChat={(tempChatId) => {
          handleSelectTemporaryChat(tempChatId);
          handleCloseSidePanel();
        }}
        onCreateDraft={(mentorId) => {
          handleCreateDraftSelection(mentorId);
          handleCloseSidePanel();
        }}
        onCloseTemporaryChat={handleCloseTemporaryChat}
      />
      <MentorDetailPanel
        isOpen={detailPanelOpen}
        slug={detailMentorSlug}
        onClose={() => setDetailPanelOpen(false)}
        onUpdated={() => {
          void refreshSidebarData();
        }}
        onDeleted={(deletedSlug) => {
          const deletedMentor = mentors.find((mentor) => mentor.slug === deletedSlug) || null;

        if (
          deletedMentor &&
          selectedChat?.kind !== 'temporary' &&
          selectedChat?.mentorId === deletedMentor.id
        ) {
          setSelectedChat(null);
          setPersistentMessages([]);
          setPersistentBranches([]);
          setPersistentSelectedBranchIds({});
          setPersistentThreadsMap(new Map());
          setDraftChats((prev) =>
            prev.filter((draft) => draft.mentorId !== deletedMentor.id)
            );
          }

          void refreshSidebarData();
        }}
      />
      <CreateMentorPanel
        isOpen={createPanelOpen}
        onClose={() => setCreatePanelOpen(false)}
        onCreated={(mentor: MentorListItem) => {
          handleCreateDraftSelection(mentor.id);
          void refreshSidebarData();
        }}
      />

      <ThreadPanel
        isOpen={threadPanelOpen}
        session={activeSession}
        temporaryChatEnabled={isTemporaryChat}
        suspendCloseShortcut={Boolean(popoverState)}
        onInputChange={handleThreadPanelInputChange}
        onSend={handleSendThreadMessage}
        onClose={closeThreadPanel}
      />
    </div>
  );
}

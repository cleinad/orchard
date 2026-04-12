"use client";

import { Suspense, useState, useCallback, useRef, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import HomeBackground from '@/app/home/components/HomeBackground';
import HomeHeader from '@/app/home/components/HomeHeader';
import ChatComposer from '@/app/home/components/ChatComposer';
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
import type { ThreadMeta, ThreadSource } from '@/app/home/components/threadTypes';
import type { SearchMetadata } from '@/lib/chat-search';
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
import ThreadPanel, { type ThreadMessage } from '@/app/home/components/ThreadPanel';
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

interface ChatModelsResponse {
  models?: ChatModelListItem[];
  error?: string;
}

type SelectedChat =
  | { kind: 'persistent'; conversationId: string; mentorId: string | null }
  | { kind: 'draft'; draftId: string; mentorId: string | null }
  | { kind: 'temporary'; tempChatId: string };

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
}

interface StoredMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  previousMessageId: string | null;
}

interface StoredThreadMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
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
}

const TTS_STORAGE_KEY = 'keen-tts-enabled';
const CHAT_MODEL_STORAGE_KEY = 'keen-chat-model';
const TEMP_CHAT_STORAGE_KEY = 'keen-home-temp-chats-v1';
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
    previousMessageId: message.previousMessageId,
  };
}

function fromStoredMessage(message: StoredMessage): Message {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    timestamp: new Date(message.timestamp),
    previousMessageId: message.previousMessageId ?? null,
  };
}

function toStoredThreadMessage(message: ThreadMessage): StoredThreadMessage {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    timestamp: message.timestamp.toISOString(),
  };
}

function fromStoredThreadMessage(message: StoredThreadMessage): ThreadMessage {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    timestamp: new Date(message.timestamp),
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
    threadMessages: Object.fromEntries(
      Object.entries(chat.threadMessages || {}).map(([threadId, messages]) => [
        threadId,
        messages.map(fromStoredThreadMessage),
      ])
    ),
  }));
}

function sortByUpdatedAtDesc<T extends { updatedAt: string }>(items: T[]) {
  return [...items].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

function recordToThreadsMap(record: ThreadMetaRecord | undefined) {
  return new Map<string, ThreadMeta[]>(Object.entries(record || {}));
}

function recordToThreadMessagesMap(record: ThreadMessagesRecord | undefined) {
  return new Map<string, ThreadMessage[]>(Object.entries(record || {}));
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
  const [isLoading, setIsLoading] = useState(false);
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
  const [draftChats, setDraftChats] = useState<PersistentDraftChat[]>([]);
  const [temporaryChats, setTemporaryChats] = useState<TemporaryChatSession[]>([]);
  const [selectedChat, setSelectedChat] = useState<SelectedChat | null>(null);
  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  const [detailMentorSlug, setDetailMentorSlug] = useState<string | null>(null);
  const [detailPanelOpen, setDetailPanelOpen] = useState(false);
  const [createPanelOpen, setCreatePanelOpen] = useState(false);
  const [pendingBranch, setPendingBranch] = useState<PendingBranchTarget | null>(null);

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

  const router = useRouter();
  const searchParams = useSearchParams();
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
    activeThread,
    threadPanelOpen,
    threadPanelInitialMessages,
    threadPanelDraftInput,
    threadPanelLoadingQuestion,
    pendingThreadMessage,
    resetThreadUi,
    dismissPopover,
    handlePointerUp,
    handleGraduateToThread,
    handleThreadClick,
    clearPendingThreadMessage,
    closeThreadPanel,
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
      ? persistentThreadsMap
      : new Map<string, ThreadMeta[]>();
  const activeTemporaryThreadMessagesMap = recordToThreadMessagesMap(
    selectedTemporaryChat?.threadMessages
  );
  const activeTemporaryThreadMessages =
    activeThread?.id && selectedTemporaryChat
      ? selectedTemporaryChat.threadMessages[activeThread.id] ?? null
      : null;
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

  const autoSendTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mentorSlugHandledRef = useRef(false);
  const appliedHomeE2eFixtureRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || isHomeE2eFixture) {
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
    if (typeof window === 'undefined' || isHomeE2eFixture) {
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
    if (isHomeE2eFixture || mentorSlugHandledRef.current) return;
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
        void handleSelectConversation(latestConversation);
      } else {
        handleCreateDraftSelection(target.id);
      }
    }

    router.replace('/home', { scroll: false });
  }, [searchParams, loadingLists, mentors, conversations, router, listError, isHomeE2eFixture]);

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
    setIsLoading(false);
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
      setInput('');
      setLastSearchState(null);
      setUserHasScrolled(false);

      if (
        selectedChat?.kind === 'draft' &&
        selectedDraftChat &&
        selectedDraftChat.messages.length === 0 &&
        !(
          nextSelection?.kind === 'draft' &&
          nextSelection.draftId === selectedDraftChat.id
        )
      ) {
        setDraftChats((prev) =>
          prev.filter((draft) => draft.id !== selectedDraftChat.id)
        );
      }
    },
    [resetThreadUi, selectedChat, selectedDraftChat, stopMic, tts]
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
      setSelectedChat(nextSelection);
    },
    [getOrCreateDraft, prepareForChatSwitch]
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
    setSelectedChat(nextSelection);
  }, [prepareForChatSwitch]);

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
      setSelectedChat(nextSelection);
    },
    [prepareForChatSwitch]
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
      setSelectedChat(nextSelection);
    },
    [draftChats, prepareForChatSwitch]
  );

  const handleSelectConversation = useCallback(
    async (conversation: ConversationListItem) => {
      const nextSelection: SelectedChat = {
        kind: 'persistent',
        conversationId: conversation.id,
        mentorId: conversation.mentor_id,
      };

      prepareForChatSwitch(nextSelection);
      setSelectedChat(nextSelection);
      setPersistentMessages([]);
      setPersistentBranches([]);
      setPersistentSelectedBranchIds({});
      setPersistentThreadsMap(new Map());

      try {
        const loadedConversation = await loadConversationMessages(conversation.id);
        setPersistentMessages(loadedConversation.messages);
        setPersistentBranches(loadedConversation.branches);
        setPersistentSelectedBranchIds(loadedConversation.selectedBranchIds);
        setPersistentThreadsMap(loadedConversation.threadsMap);
      } catch (err) {
        setListError(err instanceof Error ? err.message : 'Failed to load conversation');
      }
    },
    [loadConversationMessages, prepareForChatSwitch, setListError]
  );

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
        void handleSelectConversation(latestConversation);
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

  const setTemporaryThreadMessagesForThread = useCallback(
    (threadId: string, nextMessages: ThreadMessage[]) => {
      if (selectedChat?.kind !== 'temporary') {
        return;
      }

      updateTemporaryChat(selectedChat.tempChatId, (chat) => {
        const nextThreadMessages = { ...chat.threadMessages };

        if (nextMessages.length === 0) {
          delete nextThreadMessages[threadId];
        } else {
          nextThreadMessages[threadId] = nextMessages;
        }

        return {
          ...chat,
          threadMessages: nextThreadMessages,
        };
      });
    },
    [selectedChat, updateTemporaryChat]
  );

  const addThreadMeta = useCallback(
    (threadId: string, source: ThreadSource) => {
      if (selectedChat?.kind === 'temporary') {
        updateTemporaryChat(selectedChat.tempChatId, (chat) => ({
          ...chat,
          threadsMap: addThreadMetaToRecord(chat.threadsMap, threadId, source),
        }));
        return;
      }

      setPersistentThreadsMap((prev) => addThreadMetaToMap(prev, threadId, source));
    },
    [selectedChat, updateTemporaryChat]
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

    if (effectiveSelection.kind === 'temporary') {
      updateTemporaryChat(effectiveSelection.tempChatId, (chat) => {
        const nextTree = applyUserMessageToTree({
          messages: chat.messages,
          branches: chat.branches,
          selectedBranchIds: chat.selectedBranchIds,
          pendingBranch: effectivePendingBranch,
          userMessage,
        });

        return {
          ...chat,
          messages: nextTree.messages,
          branches: nextTree.branches,
          selectedBranchIds: nextTree.selectedBranchIds,
          updatedAt: nextUpdatedAt,
        };
      });
    } else if (effectiveSelection.kind === 'persistent') {
      const nextTree = applyUserMessageToTree({
        messages: persistentMessages,
        branches: persistentBranches,
        selectedBranchIds: persistentSelectedBranchIds,
        pendingBranch: effectivePendingBranch,
        userMessage,
      });
      setPersistentMessages(nextTree.messages);
      setPersistentBranches(nextTree.branches);
      setPersistentSelectedBranchIds(nextTree.selectedBranchIds);
    } else {
      const draft = effectiveDraft || getOrCreateDraft(effectiveSelection.mentorId);
      effectiveDraft = draft;
      updateDraftChat(draft.id, (currentDraft) => {
        const nextTree = applyUserMessageToTree({
          messages: currentDraft.messages,
          branches: currentDraft.branches,
          selectedBranchIds: currentDraft.selectedBranchIds,
          pendingBranch: effectivePendingBranch,
          userMessage,
        });

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
    setIsLoading(true);
    setLastSearchState(null);
    setUserHasScrolled(false);

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

      const data = (await response.json()) as ChatResponse;
      logResolvedChatModel(data, 'composer');

      if (!response.ok || data.error) {
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
          setPersistentMessages((prev) => [...prev, errorMessage]);
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
            ? createTemporaryId('message')
            : data.assistantMessageId || (Date.now() + 1).toString(),
        role: 'assistant',
        content: responseText,
        timestamp: new Date(),
        previousMessageId: data.userMessageId || userMessage.id,
      };

      if (effectiveSelection.kind === 'temporary') {
        updateTemporaryChat(effectiveSelection.tempChatId, (chat) => ({
          ...chat,
          title:
            data.conversationTitle ||
            fallbackChatTitleFromMessage(messageText, TEMP_CHAT_TITLE),
          messages: [...chat.messages, assistantMessage],
          updatedAt: new Date().toISOString(),
        }));
      } else if (effectiveSelection.kind === 'persistent') {
        const loadedConversation = await loadConversationMessages(
          effectiveSelection.conversationId
        );
        const mergedSelections = {
          ...loadedConversation.selectedBranchIds,
          ...persistentSelectedBranchIds,
        };
        if (branchSourceMessageId) {
          const latestBranch = [...loadedConversation.branches]
            .filter((branch) => branch.sourceMessageId === branchSourceMessageId)
            .sort((a, b) => b.position - a.position)[0];

          if (latestBranch) {
            mergedSelections[branchSourceMessageId] = latestBranch.id;
          }
        }

        setPersistentMessages(loadedConversation.messages);
        setPersistentBranches(loadedConversation.branches);
        setPersistentSelectedBranchIds(mergedSelections);
        setPersistentThreadsMap(loadedConversation.threadsMap);

        if (!isHomeE2eFixture) {
          await refreshSidebarData();
        }
      } else if (effectiveDraft && data.conversationId) {
        const nextPersistentSelection: SelectedChat = {
          kind: 'persistent',
          conversationId: data.conversationId,
          mentorId: effectiveDraft.mentorId,
        };
        const loadedConversation = await loadConversationMessages(data.conversationId);
        const mergedSelections = {
          ...loadedConversation.selectedBranchIds,
          ...effectiveDraft.selectedBranchIds,
        };
        if (branchSourceMessageId) {
          const latestBranch = [...loadedConversation.branches]
            .filter((branch) => branch.sourceMessageId === branchSourceMessageId)
            .sort((a, b) => b.position - a.position)[0];

          if (latestBranch) {
            mergedSelections[branchSourceMessageId] = latestBranch.id;
          }
        }

        setPersistentMessages(loadedConversation.messages);
        setPersistentBranches(loadedConversation.branches);
        setPersistentSelectedBranchIds(mergedSelections);
        setPersistentThreadsMap(loadedConversation.threadsMap);
        setDraftChats((prev) => prev.filter((draft) => draft.id !== effectiveDraft!.id));
        setSelectedChat(nextPersistentSelection);
        if (!isHomeE2eFixture) {
          await refreshSidebarData();
        }
      }

      if (ttsEnabled && responseText && !responseText.startsWith('Something went wrong')) {
        tts.speak(responseText);
      }
    } catch {
      const errorMessage: Message = {
        id:
          effectiveSelection.kind === 'temporary'
            ? createTemporaryId('message')
            : (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Sorry, there was an error processing your message.',
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
        setPersistentMessages((prev) => [...prev, errorMessage]);
      } else if (effectiveDraft) {
        updateDraftChat(effectiveDraft.id, (draft) => ({
          ...draft,
          messages: [...draft.messages, errorMessage],
          updatedAt: new Date().toISOString(),
        }));
      }
    } finally {
      setIsLoading(false);
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

  const handleThreadCreated = useCallback(
    (threadId: string, source: ThreadSource) => {
      addThreadMeta(threadId, source);
    },
    [addThreadMeta]
  );

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
        : "What's on your mind?";
  const emptySubtitle = isTemporaryChat
    ? 'Nothing from this chat will be saved.'
    : selectedChat?.kind === 'draft'
      ? activeMentor?.tagline || 'Start a new conversation.'
      : activeMentor
        ? activeMentor.tagline
        : "I'm Listening";

  return (
    <div className="relative flex h-dvh min-h-0 flex-col overflow-hidden bg-background text-foreground">
      <HomeBackground />

      <main
        className={`relative flex min-h-0 flex-1 flex-col transition-[padding] duration-300 ease-out ${
          sidePanelOpen ? 'lg:pl-[380px]' : ''
        } ${threadPanelOpen ? 'lg:pr-[460px]' : ''}`}
      >
        <div className="w-full shrink-0 px-6">
          <HomeHeader
            activeName={activeName}
            isTemporaryChat={isTemporaryChat}
            temporaryMemoryMode={activeTemporaryMemoryMode}
            isSidePanelOpen={sidePanelOpen}
            onToggleSidePanel={handleToggleSidePanel}
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
          <ConversationView
            loadingLists={loadingLists}
            listError={listError}
            messages={activeMessages}
            activeName={activeName}
            emptyTitle={emptyTitle}
            emptySubtitle={emptySubtitle}
            isLoading={isLoading}
            threadsMap={activeThreadsMap}
            branchChipsByMessageId={branchChipsByMessageId}
            pendingBranchSourceMessageId={pendingBranch?.sourceMessageId ?? null}
            messagesEndRef={messagesEndRef}
            onThreadClick={handleThreadClick}
            onSelectBranch={handleSelectBranch}
            onCreateBranch={handleCreateBranch}
            onAssistantPointerUp={handlePointerUp}
          />
          <TextSelectionPopover
            popoverState={popoverState}
            chatMode={chatMode}
            conversationId={activeConversationId}
            mentorId={activeMentorId}
            modelId={selectedModelId}
            memoryMode={activeTemporaryMemoryMode}
            history={activeMessages}
            temporaryThreadMessages={activeTemporaryThreadMessagesMap}
            onTemporaryThreadMessagesChange={setTemporaryThreadMessagesForThread}
            onDismiss={dismissPopover}
            onThreadCreated={handleThreadCreated}
            onGraduateToThread={handleGraduateToThread}
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
        thread={activeThread}
        chatMode={chatMode}
        conversationId={activeConversationId}
        mentorId={activeMentorId}
        modelId={selectedModelId}
        memoryMode={activeTemporaryMemoryMode}
        conversationMessages={activeMessages}
        initialMessages={threadPanelInitialMessages}
        temporaryMessages={activeTemporaryThreadMessages}
        temporaryChatEnabled={isTemporaryChat}
        draftInput={threadPanelDraftInput}
        loadingQuestion={threadPanelLoadingQuestion}
        pendingMessage={pendingThreadMessage}
        onTemporaryMessagesChange={setTemporaryThreadMessagesForThread}
        onPendingMessageConsumed={clearPendingThreadMessage}
        onThreadCreated={handleThreadCreated}
        suspendCloseShortcut={Boolean(popoverState)}
        onClose={closeThreadPanel}
      />
    </div>
  );
}

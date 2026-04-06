"use client";

import { Suspense, useState, useCallback, useRef, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import HomeBackground from '@/app/home/components/HomeBackground';
import HomeHeader from '@/app/home/components/HomeHeader';
import ChatComposer from '@/app/home/components/ChatComposer';
import ConversationView from '@/app/home/components/ConversationView';
import { useHomeData } from '@/app/home/components/useHomeData';
import { useHomeThreads } from '@/app/home/components/useHomeThreads';
import { useHomeVoice } from '@/app/home/components/useHomeVoice';
import type { ThreadMeta } from '@/app/home/components/MarkdownWithThreads';
import type { SearchMetadata } from '@/lib/chat-search';
import type { MentorListItem } from '@/lib/mentors/types';
import SidePanel from '@/app/home/components/SidePanel';
import MentorDetailPanel from '@/app/home/components/MentorDetailPanel';
import CreateMentorPanel from '@/app/home/components/CreateMentorPanel';
import { LearningModeProvider, useLearningMode } from '@/app/home/components/LearningModeContext';
import TextSelectionPopover from '@/app/home/components/TextSelectionPopover';
import ThreadPanel, { type ThreadMessage } from '@/app/home/components/ThreadPanel';
import type { ConversationListItem, Message } from '@/app/home/types';
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
  search?: SearchMetadata;
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
  threadsMap: ThreadMetaRecord;
  threadMessages: ThreadMessagesRecord;
}

interface StoredMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
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
  threadsMap: ThreadMetaRecord;
  threadMessages: Record<string, StoredThreadMessage[]>;
}

const TTS_STORAGE_KEY = 'keen-tts-enabled';
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
  };
}

function fromStoredMessage(message: StoredMessage): Message {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    timestamp: new Date(message.timestamp),
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
  sourceMessageId: string,
  highlightedText: string
) {
  const next = new Map(prev);
  const existing = next.get(sourceMessageId) || [];

  if (existing.some((thread) => thread.threadId === threadId)) {
    return next;
  }

  next.set(sourceMessageId, [
    ...existing,
    { threadId, highlightedText, sourceMessageId },
  ]);

  return next;
}

function addThreadMetaToRecord(
  prev: ThreadMetaRecord,
  threadId: string,
  sourceMessageId: string,
  highlightedText: string
) {
  const existing = prev[sourceMessageId] || [];

  if (existing.some((thread) => thread.threadId === threadId)) {
    return prev;
  }

  return {
    ...prev,
    [sourceMessageId]: [
      ...existing,
      { threadId, highlightedText, sourceMessageId },
    ],
  };
}

function findLatestConversationForMentor(
  mentorId: string | null,
  conversations: ConversationListItem[]
) {
  return conversations.find((conversation) => conversation.mentor_id === mentorId) || null;
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
  const [lastSearchState, setLastSearchState] = useState<SearchMetadata | null>(null);
  const [persistentMessages, setPersistentMessages] = useState<Message[]>([]);
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

  const { learningMode } = useLearningMode();

  const router = useRouter();
  const searchParams = useSearchParams();

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
  const activeTemporaryMemoryMode =
    selectedTemporaryChat?.memoryMode ?? 'use_existing';
  const activeConversationId =
    selectedChat?.kind === 'persistent' ? selectedChat.conversationId : null;
  const activeMessages = isTemporaryChat
    ? selectedTemporaryChat?.messages || []
    : selectedChat?.kind === 'draft'
      ? selectedDraftChat?.messages || []
      : selectedChat?.kind === 'persistent'
        ? persistentMessages
        : [];
  const activeThreadsMap = isTemporaryChat
    ? recordToThreadsMap(selectedTemporaryChat?.threadsMap)
    : selectedChat?.kind === 'persistent'
      ? persistentThreadsMap
      : new Map<string, ThreadMeta[]>();
  const activeTemporaryThreadMessagesMap = recordToThreadMessagesMap(
    selectedTemporaryChat?.threadMessages
  );
  const activeTemporaryThreadMessages = activeThread
    ? selectedTemporaryChat?.threadMessages[activeThread.id] ?? null
    : null;
  const activeName = isTemporaryChat
    ? 'Keen'
    : selectedConversation?.mentor_name || activeMentor?.name || 'Keen';

  const autoSendTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mentorSlugHandledRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') {
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
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
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
  }, [temporaryChats]);

  useEffect(() => {
    void refreshSidebarData();
  }, [refreshSidebarData]);

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
    if (mentorSlugHandledRef.current) return;
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
  }, [searchParams, loadingLists, mentors, conversations, router, listError]);

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

  const createDraft = useCallback((mentorId: string | null): PersistentDraftChat => {
    const now = new Date().toISOString();

    return {
      id: createTemporaryId('draft'),
      mentorId,
      title: 'New chat',
      createdAt: now,
      updatedAt: now,
      messages: [],
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
      threadsMap: {},
      threadMessages: {},
    };

    const nextSelection: SelectedChat = {
      kind: 'temporary',
      tempChatId: chat.id,
    };

    prepareForChatSwitch(nextSelection);
    setPersistentMessages([]);
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
      setPersistentThreadsMap(new Map());

      try {
        const loadedConversation = await loadConversationMessages(conversation.id);
        setPersistentMessages(loadedConversation.messages);
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
    (threadId: string, sourceMessageId: string, highlightedText: string) => {
      if (selectedChat?.kind === 'temporary') {
        updateTemporaryChat(selectedChat.tempChatId, (chat) => ({
          ...chat,
          threadsMap: addThreadMetaToRecord(
            chat.threadsMap,
            threadId,
            sourceMessageId,
            highlightedText
          ),
        }));
        return;
      }

      setPersistentThreadsMap((prev) =>
        addThreadMetaToMap(prev, threadId, sourceMessageId, highlightedText)
      );
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
    };

    if (effectiveSelection.kind === 'temporary') {
      updateTemporaryChat(effectiveSelection.tempChatId, (chat) => ({
        ...chat,
        messages: [...chat.messages, userMessage],
        updatedAt: nextUpdatedAt,
      }));
    } else if (effectiveSelection.kind === 'persistent') {
      setPersistentMessages((prev) => [...prev, userMessage]);
    } else {
      const draft = effectiveDraft || getOrCreateDraft(effectiveSelection.mentorId);
      effectiveDraft = draft;
      updateDraftChat(draft.id, (currentDraft) => ({
        ...currentDraft,
        messages: [...currentDraft.messages, userMessage],
        updatedAt: nextUpdatedAt,
      }));
    }

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
          searchEnabled,
          chatMode:
            effectiveSelection.kind === 'temporary' ? 'temporary' : 'persistent',
          ...(effectiveSelection.kind === 'temporary'
            ? {
                memoryMode: effectiveTempChat?.memoryMode ?? 'use_existing',
                history: toChatHistory(effectiveTempChat?.messages || []),
              }
            : {}),
        }),
      });

      const data = (await response.json()) as ChatResponse;

      if (!response.ok || data.error) {
        const errorMessage: Message = {
          id:
            effectiveSelection.kind === 'temporary'
              ? createTemporaryId('message')
              : (Date.now() + 1).toString(),
          role: 'assistant',
          content: `Something went wrong. ${data.error || ''}`.trim(),
          timestamp: new Date(),
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
        setPersistentMessages((prev) => {
          const updated = data.userMessageId
            ? prev.map((message) =>
                message.id === userMessage.id
                  ? { ...message, id: data.userMessageId! }
                  : message
              )
            : prev;
          return [...updated, assistantMessage];
        });

        await refreshSidebarData();
      } else if (effectiveDraft && data.conversationId) {
        const nextPersistentSelection: SelectedChat = {
          kind: 'persistent',
          conversationId: data.conversationId,
          mentorId: effectiveDraft.mentorId,
        };

        const persistedUserMessage = data.userMessageId
          ? { ...userMessage, id: data.userMessageId }
          : userMessage;

        setPersistentMessages([persistedUserMessage, assistantMessage]);
        setPersistentThreadsMap(new Map());
        setDraftChats((prev) => prev.filter((draft) => draft.id !== effectiveDraft!.id));
        setSelectedChat(nextPersistentSelection);
        await refreshSidebarData();
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
    refreshSidebarData,
    searchEnabled,
    selectedChat,
    selectedDraftChat,
    selectedTemporaryChat,
    transcription,
    tts,
    ttsEnabled,
    updateDraftChat,
    updateTemporaryChat,
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
    (threadId: string, sourceMessageId: string, highlightedText: string) => {
      addThreadMeta(threadId, sourceMessageId, highlightedText);
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
            onOpenSidePanel={() => setSidePanelOpen(true)}
            onBrowseMentors={() => router.push('/mentors')}
            onCreateTemporaryChat={handleCreateTemporaryChat}
          />
        </div>

        <div
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
            messagesEndRef={messagesEndRef}
            onThreadClick={handleThreadClick}
            onAssistantPointerUp={handlePointerUp}
          />
          <TextSelectionPopover
            popoverState={popoverState}
            chatMode={chatMode}
            conversationId={activeConversationId}
            mentorId={activeMentorId}
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
          input={input}
          isLoading={isLoading}
          micActive={micActive}
          ttsEnabled={ttsEnabled}
          searchEnabled={searchEnabled}
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
          onToggleMic={toggleMic}
          onToggleTts={toggleTtsEnabled}
          onToggleSearch={() => setSearchEnabled((prev) => !prev)}
          onTemporaryMemoryModeChange={updateSelectedTemporaryMemoryMode}
          onSubmit={handleSubmit}
          onKeyDown={handleKeyDown}
        />
      </main>

      <SidePanel
        isOpen={sidePanelOpen}
        onClose={() => setSidePanelOpen(false)}
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
          setSidePanelOpen(false);
        }}
        onSelectDraft={(draftId) => {
          handleSelectDraft(draftId);
          setSidePanelOpen(false);
        }}
        onSelectTemporaryChat={(tempChatId) => {
          handleSelectTemporaryChat(tempChatId);
          setSidePanelOpen(false);
        }}
        onCreateDraft={(mentorId) => {
          handleCreateDraftSelection(mentorId);
          setSidePanelOpen(false);
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
        memoryMode={activeTemporaryMemoryMode}
        conversationMessages={activeMessages}
        initialMessages={threadPanelInitialMessages}
        temporaryMessages={activeTemporaryThreadMessages}
        temporaryChatEnabled={isTemporaryChat}
        pendingMessage={pendingThreadMessage}
        onTemporaryMessagesChange={setTemporaryThreadMessagesForThread}
        onPendingMessageConsumed={clearPendingThreadMessage}
        onClose={closeThreadPanel}
      />
    </div>
  );
}

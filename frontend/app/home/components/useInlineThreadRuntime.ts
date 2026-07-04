"use client";

import {
  useCallback,
  useEffect,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import type {
  SelectedChat,
  TemporaryChatSession,
} from '@/app/home/components/HomeDataContext';
import { logResolvedChatModel } from '@/app/home/components/logResolvedChatModel';
import {
  addThreadMetaToMap,
  addThreadMetaToRecord,
  createEmptyPersistentThreadRuntime,
  deserializePersistentThreadRuntimes,
  mapThreadMessages,
  mergeThreadMessages,
  serializePersistentThreadRuntimes,
  type PersistentThreadRuntime,
  type PersistentThreadRuntimeRecord,
} from '@/app/home/components/persistentThreadRuntime';
import {
  readChatStream,
  type ChatResponse,
} from '@/app/home/components/useMainChatRuntime';
import type {
  InlineThreadMarker,
  ThreadMessage,
  ThreadMeta,
  ThreadSession,
  ThreadSessionStatus,
  ThreadSource,
} from '@/app/home/components/threadTypes';
import type { Message } from '@/app/home/types';
import {
  createTemporaryId,
  toChatHistory,
  type TemporaryMemoryMode,
} from '@/lib/chat-session';
import { getBrowserTimeZone } from '@/lib/browser-timezone';
import type { ChatModelEffortLevel } from '@/lib/chat-models';
import type { SearchMode } from '@/lib/chat-search';
import type { ResponseStyle } from '@/lib/response-style';

interface UseInlineThreadRuntimeParams {
  activeConversationId: string | null;
  activeMessages: Message[];
  activeTemporaryMemoryMode: TemporaryMemoryMode;
  activateThreadSession: (sessionId: string) => void;
  createThreadSession: (
    session: ThreadSession,
    options?: { makeActive?: boolean }
  ) => void;
  findThreadSessionId: (threadId: string) => string | null;
  persistentThreadRuntimes: PersistentThreadRuntimeRecord;
  persistentThreadRuntimesRef: MutableRefObject<PersistentThreadRuntimeRecord>;
  selectedChat: SelectedChat | null;
  selectedChatRef: MutableRefObject<SelectedChat | null>;
  selectedModelId: string;
  selectedModelEffort: ChatModelEffortLevel | null;
  thinkingEnabled: boolean | null;
  responseStyle: ResponseStyle;
  searchMode: SearchMode;
  selectedTemporaryChat: TemporaryChatSession | null;
  setPersistentThreadRuntimes: Dispatch<SetStateAction<PersistentThreadRuntimeRecord>>;
  setPersistentThreadsMap: Dispatch<SetStateAction<Map<string, ThreadMeta[]>>>;
  storageKey: string;
  threadSessionsRef: MutableRefObject<Record<string, ThreadSession>>;
  updateTemporaryChat: (
    id: string,
    updater: (chat: TemporaryChatSession) => TemporaryChatSession
  ) => void;
  updateThreadSession: (
    sessionId: string,
    updater: (session: ThreadSession) => ThreadSession
  ) => void;
}

export function useInlineThreadRuntime({
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
  selectedModelEffort,
  thinkingEnabled,
  responseStyle,
  searchMode,
  selectedTemporaryChat,
  setPersistentThreadRuntimes,
  setPersistentThreadsMap,
  storageKey,
  threadSessionsRef,
  updateTemporaryChat,
  updateThreadSession,
}: UseInlineThreadRuntimeParams) {
  useEffect(() => {
    const stored = window.sessionStorage.getItem(storageKey);
    if (!stored) {
      return;
    }

    try {
      setPersistentThreadRuntimes(deserializePersistentThreadRuntimes(stored));
    } catch (error) {
      console.error('Failed to restore persistent thread runtime:', error);
      window.sessionStorage.removeItem(storageKey);
    }
  }, [setPersistentThreadRuntimes, storageKey]);

  useEffect(() => {
    if (Object.keys(persistentThreadRuntimes).length === 0) {
      window.sessionStorage.removeItem(storageKey);
      return;
    }

    window.sessionStorage.setItem(
      storageKey,
      serializePersistentThreadRuntimes(persistentThreadRuntimes)
    );
  }, [persistentThreadRuntimes, storageKey]);

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
    [setPersistentThreadRuntimes]
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
    [selectedChatRef, setPersistentThreadsMap, updatePersistentThreadRuntime]
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
      selectionStreamVersion: source.selectionStreamVersion,
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
            ...(selectedModelEffort ? { modelEffort: selectedModelEffort } : {}),
            ...(thinkingEnabled !== null ? { thinkingEnabled } : {}),
            responseStyle,
            searchMode,
            sourceMessageId: params.source.sourceMessageId,
            highlightedText: params.source.highlightedText,
            startOffset: params.source.startOffset,
            endOffset: params.source.endOffset,
            selectionStreamVersion: params.source.selectionStreamVersion,
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
      selectedModelEffort,
      responseStyle,
      searchMode,
      selectedModelId,
      thinkingEnabled,
      threadSessionsRef,
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
      threadSessionsRef,
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
      persistentThreadRuntimesRef,
      selectedChat,
      selectedTemporaryChat?.threadMessages,
      selectedTemporaryChat?.threadStatuses,
      threadSessionsRef,
      updateThreadSession,
    ]
  );

  return {
    handleSendThreadMessage,
    handleThreadMarkerClick,
    handleThreadPanelInputChange,
    openThreadDraft,
    submitThreadQuestion,
  };
}

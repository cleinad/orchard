"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
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
  addThreadMetaToRecord,
  createEmptyPersistentThreadRuntime,
  deserializePersistentThreadRuntimes,
  mapThreadMessages,
  mergeThreadMessages,
  removeThreadMetaFromRecord,
  serializePersistentThreadRuntimes,
  type PersistentThreadRuntime,
  type PersistentThreadRuntimeRecord,
} from '@/app/home/components/persistentThreadRuntime';
import { getSelectionStreamVersion } from '@/app/home/components/markdownSelectableStream';
import {
  readChatStream,
  type ChatResponse,
} from '@/app/home/components/useMainChatRuntime';
import type {
  InlineThreadMarker,
  ThreadMessage,
  ThreadSession,
  ThreadSessionStatus,
  ThreadSource,
} from '@/app/home/components/threadTypes';
import type { Message } from '@/app/home/types';
import {
  createTemporaryId,
  toChatHistory,
  toChatHistoryMessageIds,
} from '@/lib/chat-session';
import { getBrowserTimeZone } from '@/lib/browser-timezone';
import type { ChatModelEffortLevel } from '@/lib/chat-models';
import type { SearchMode } from '@/lib/chat-search';
import type { ResponseStyle } from '@/lib/response-style';
import { useOptionalChatRunCoordinator } from '@/app/components/ChatRunCoordinator';
import {
  createChatRunIdentifiers,
  createQueuedChatRunSnapshot,
  type ChatRunIdentifiers,
  isTerminalChatRunStatus,
} from '@/lib/chat-runs/protocol';
import { fallbackChatTitleFromMessage } from '@/lib/chat-session';

interface UseInlineThreadRuntimeParams {
  activeConversationId: string | null;
  activeMessages: Message[];
  activateThreadSession: (sessionId: string) => void;
  createThreadSession: (
    session: ThreadSession,
    options?: { makeActive?: boolean }
  ) => void;
  findThreadSessionId: (threadId: string) => string | null;
  persistentThreadRuntimes: PersistentThreadRuntimeRecord;
  persistentThreadRuntimesRef: MutableRefObject<PersistentThreadRuntimeRecord>;
  selectedChat: SelectedChat | null;
  selectedModelId: string;
  selectedModelEffort: ChatModelEffortLevel | null;
  thinkingEnabled: boolean | null;
  responseStyle: ResponseStyle;
  searchMode: SearchMode;
  selectedTemporaryChat: TemporaryChatSession | null;
  setPersistentThreadRuntimes: Dispatch<SetStateAction<PersistentThreadRuntimeRecord>>;
  upsertPersistentThreadMeta: (
    conversationId: string,
    threadId: string,
    source: ThreadSource,
    previousThreadId?: string
  ) => void;
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
  activateThreadSession,
  createThreadSession,
  findThreadSessionId,
  persistentThreadRuntimes,
  persistentThreadRuntimesRef,
  selectedChat,
  selectedModelId,
  selectedModelEffort,
  thinkingEnabled,
  responseStyle,
  searchMode,
  selectedTemporaryChat,
  setPersistentThreadRuntimes,
  upsertPersistentThreadMeta,
  storageKey,
  threadSessionsRef,
  updateTemporaryChat,
  updateThreadSession,
}: UseInlineThreadRuntimeParams) {
  const chatRunCoordinator = useOptionalChatRunCoordinator();
  const [persistentThreadStorageRestored, setPersistentThreadStorageRestored] =
    useState(false);
  const reconciledPersistentThreadRunVersionsRef = useRef(new Set<string>());
  useEffect(() => {
    const stored = window.sessionStorage.getItem(storageKey);
    if (!stored) {
      setPersistentThreadStorageRestored(true);
      return;
    }

    try {
      setPersistentThreadRuntimes(deserializePersistentThreadRuntimes(stored));
    } catch (error) {
      console.error('Failed to restore persistent thread runtime:', error);
      window.sessionStorage.removeItem(storageKey);
    } finally {
      setPersistentThreadStorageRestored(true);
    }
  }, [setPersistentThreadRuntimes, storageKey]);

  useEffect(() => {
    if (!persistentThreadStorageRestored) return;
    if (Object.keys(persistentThreadRuntimes).length === 0) {
      window.sessionStorage.removeItem(storageKey);
      return;
    }

    window.sessionStorage.setItem(
      storageKey,
      serializePersistentThreadRuntimes(persistentThreadRuntimes)
    );
  }, [persistentThreadRuntimes, persistentThreadStorageRestored, storageKey]);

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

      upsertPersistentThreadMeta(conversationId, threadId, source);
    },
    [updatePersistentThreadRuntime, upsertPersistentThreadMeta]
  );

  const replaceThreadResultId = useCallback(
    (
      selection: Extract<SelectedChat, { kind: 'temporary' | 'persistent' }>,
      previousThreadId: string,
      threadId: string,
      source: ThreadSource
    ) => {
      if (previousThreadId === threadId) {
        return;
      }

      if (selection.kind === 'temporary') {
        updateTemporaryChat(selection.tempChatId, (chat) => {
          const nextThreadMessages = { ...chat.threadMessages };
          const previousMessages = nextThreadMessages[previousThreadId] ?? [];
          delete nextThreadMessages[previousThreadId];
          if (previousMessages.length > 0 && !nextThreadMessages[threadId]) {
            nextThreadMessages[threadId] = previousMessages;
          }

          const nextThreadStatuses = { ...chat.threadStatuses };
          const previousStatus = nextThreadStatuses[previousThreadId];
          delete nextThreadStatuses[previousThreadId];
          if (previousStatus && !nextThreadStatuses[threadId]) {
            nextThreadStatuses[threadId] = previousStatus;
          }

          return {
            ...chat,
            threadsMap: addThreadMetaToRecord(
              removeThreadMetaFromRecord(chat.threadsMap, previousThreadId),
              threadId,
              source
            ),
            threadMessages: nextThreadMessages,
            threadStatuses: nextThreadStatuses,
            updatedAt: new Date().toISOString(),
          };
        });
        return;
      }

      updatePersistentThreadRuntime(selection.conversationId, (runtime) => {
        const nextThreadMessages = { ...runtime.threadMessages };
        const previousMessages = nextThreadMessages[previousThreadId] ?? [];
        delete nextThreadMessages[previousThreadId];
        if (previousMessages.length > 0 && !nextThreadMessages[threadId]) {
          nextThreadMessages[threadId] = previousMessages;
        }

        const nextThreadStatuses = { ...runtime.threadStatuses };
        const previousStatus = nextThreadStatuses[previousThreadId];
        delete nextThreadStatuses[previousThreadId];
        if (previousStatus && !nextThreadStatuses[threadId]) {
          nextThreadStatuses[threadId] = previousStatus;
        }

        return {
          threadsMap: addThreadMetaToRecord(
            removeThreadMetaFromRecord(runtime.threadsMap, previousThreadId),
            threadId,
            source
          ),
          threadMessages: nextThreadMessages,
          threadStatuses: nextThreadStatuses,
        };
      });
      upsertPersistentThreadMeta(
        selection.conversationId,
        threadId,
        source,
        previousThreadId
      );
    },
    [updatePersistentThreadRuntime, updateTemporaryChat, upsertPersistentThreadMeta]
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

  useEffect(() => {
    if (!chatRunCoordinator) return;

    return chatRunCoordinator.subscribeAll((run) => {
      if (
        run.mode !== 'persistent'
        || run.target.kind !== 'thread'
        || !run.target.threadId
      ) return;

      const conversationId = run.target.conversationId ?? run.target.chatId;
      const targetThreadId = run.target.threadId;
      const threadId = run.createdThreadId ?? targetThreadId;
      if (threadId !== targetThreadId) {
        const runtime = persistentThreadRuntimesRef.current[conversationId];
        const source = runtime
          ? Object.values(runtime.threadsMap)
              .flat()
              .find((thread) => thread.threadId === targetThreadId)
          : null;
        if (source) {
          replaceThreadResultId(
            {
              kind: 'persistent',
              conversationId,
              mentorId: null,
              workspaceId: null,
            },
            targetThreadId,
            threadId,
            source
          );
        }
      }
      if (run.status !== 'interrupted' && !isTerminalChatRunStatus(run.status)) {
        setPersistentThreadStatus(conversationId, threadId, 'loading');
        return;
      }
      if (run.status !== 'completed') {
        setPersistentThreadStatus(
          conversationId,
          threadId,
          run.status === 'cancelled' ? 'ready' : 'error'
        );
        return;
      }

      const versionKey = `${run.runId}:${run.status}:${run.updatedAt}`;
      if (reconciledPersistentThreadRunVersionsRef.current.has(versionKey)) {
        return;
      }
      reconciledPersistentThreadRunVersionsRef.current.add(versionKey);
      setPersistentThreadStatus(conversationId, threadId, 'ready');

      void fetch(`/api/threads/${threadId}/messages`)
        .then(async (response) => {
          if (!response.ok) throw new Error('Failed to reconcile thread');
          const data = await response.json() as {
            thread?: {
              threadId?: unknown;
              conversationId?: unknown;
              sourceMessageId?: unknown;
              highlightedText?: unknown;
              startOffset?: unknown;
              endOffset?: unknown;
              selectionStreamVersion?: unknown;
            };
            messages?: Parameters<typeof mapThreadMessages>[0];
          };
          const thread = data.thread;
          if (
            thread
            && thread.threadId === threadId
            && thread.conversationId === conversationId
            && typeof thread.sourceMessageId === 'string'
            && typeof thread.highlightedText === 'string'
            && typeof thread.startOffset === 'number'
            && typeof thread.endOffset === 'number'
          ) {
            const source = {
              sourceMessageId: thread.sourceMessageId,
              highlightedText: thread.highlightedText,
              startOffset: thread.startOffset,
              endOffset: thread.endOffset,
              selectionStreamVersion: getSelectionStreamVersion(
                typeof thread.selectionStreamVersion === 'string'
                  ? thread.selectionStreamVersion
                  : null
              ),
            };
            if (threadId !== targetThreadId) {
              replaceThreadResultId(
                {
                  kind: 'persistent',
                  conversationId,
                  mentorId: null,
                  workspaceId: null,
                },
                targetThreadId,
                threadId,
                source
              );
            } else {
              addPersistentThreadMeta(conversationId, threadId, source);
            }
          }
          const messages = mapThreadMessages(data.messages ?? []);
          setPersistentThreadMessages(conversationId, threadId, messages);
          setPersistentThreadStatus(conversationId, threadId, 'ready');
        })
        .catch(() => {
          reconciledPersistentThreadRunVersionsRef.current.delete(versionKey);
        });
    });
  }, [
    addPersistentThreadMeta,
    chatRunCoordinator,
    persistentThreadRuntimesRef,
    replaceThreadResultId,
    setPersistentThreadMessages,
    setPersistentThreadStatus,
  ]);

  const sendThreadRequest = useCallback(
    async (params: {
      sessionId: string;
      question: string;
      selection: Extract<SelectedChat, { kind: 'temporary' | 'persistent' }>;
      source: ThreadSource;
      requestThreadId: string | null;
      previousMessages: ThreadMessage[];
      optimisticMessages: ThreadMessage[];
      optimisticUserMessageId: string;
      identifiers: ChatRunIdentifiers;
      isNewThread: boolean;
    }) => {
      if (params.selection.kind !== 'persistent' && params.selection.kind !== 'temporary') {
        return;
      }
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

        if (
          nextThreadId
          && params.requestThreadId
          && nextThreadId !== params.requestThreadId
        ) {
          replaceThreadResultId(
            params.selection,
            params.requestThreadId,
            nextThreadId,
            params.source
          );
        }

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
        const runMode = params.selection.kind === 'temporary'
          ? 'temporary' as const
          : 'persistent' as const;
        const runTarget = {
          kind: 'thread' as const,
          chatId: params.selection.kind === 'temporary'
            ? params.selection.tempChatId
            : params.selection.conversationId,
          conversationId: params.selection.kind === 'persistent'
            ? params.selection.conversationId
            : null,
          threadId: params.requestThreadId,
          branchId: null,
          branchSourceMessageId: null,
          sourceMessageId: params.source.sourceMessageId,
          expectedPredecessorId: params.previousMessages.at(-1)?.id ?? null,
        };
        const requestBody = {
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
            previousMessageId: params.previousMessages.at(-1)?.id ?? null,
            ...(!params.isNewThread && params.requestThreadId
              ? { threadId: params.requestThreadId }
              : {}),
            timezone: getBrowserTimeZone(),
            chatMode: params.selection.kind === 'temporary' ? 'temporary' : 'persistent',
            ...(params.selection.kind === 'persistent'
              ? {
                  historyMessageIds: toChatHistoryMessageIds(
                    activeMessages,
                    params.source.sourceMessageId
                  ),
                }
              : {}),
            run: {
              ...params.identifiers,
              temporarySessionId:
                params.selection.kind === 'temporary'
                  ? params.selection.tempChatId
                  : undefined,
              newThreadId: params.isNewThread
                ? params.requestThreadId ?? undefined
                : undefined,
              target: runTarget,
            },
            ...(params.selection.kind === 'temporary'
              ? {
                  history: toChatHistory(activeMessages),
                  threadHistory: toChatHistory(params.previousMessages),
                }
              : {}),
          };
        let data: ChatResponse;
        if (chatRunCoordinator) {
          const run = await chatRunCoordinator.start({
            request: requestBody,
            initialSnapshot: createQueuedChatRunSnapshot({
              identifiers: params.identifiers,
              mode: runMode,
              target: runTarget,
              fallbackTitle: fallbackChatTitleFromMessage(params.question),
            }),
          });
          data = {
            message: run.response ?? undefined,
            conversationId: run.target.conversationId ?? undefined,
            threadId: run.createdThreadId ?? run.target.threadId,
            userMessageId: run.userMessageId,
            assistantMessageId: run.assistantMessageId,
            search: run.search ?? undefined,
            searchActivity: run.searchActivity,
            ...(run.status === 'failed' || run.status === 'interrupted'
              ? { error: run.errorMessage ?? 'Thread run failed.' }
              : {}),
            cancelled: run.status === 'cancelled',
          };
        } else {
          const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
          });
          data = response.ok
            ? await readChatStream(response, () => {})
            : (await response.json()) as ChatResponse;
          if (!response.ok && !data.error) data.error = 'Something went wrong.';
        }

        logResolvedChatModel(data, 'thread');
        const resolvedThreadId =
          typeof data.threadId === 'string' && data.threadId.length > 0
            ? data.threadId
            : params.requestThreadId;

        if (data.cancelled) {
          const latestSession = threadSessionsRef.current[params.sessionId];
          const messages = latestSession?.messages ?? params.optimisticMessages;
          updateThreadSession(params.sessionId, (session) => ({
            ...session,
            status: 'ready',
            isHydrating: false,
          }));
          persistThreadResult(
            { selection: params.selection, source: params.source },
            resolvedThreadId,
            messages,
            'ready'
          );
          return;
        }

        if (data.error || !data.message) {
          finalizeThreadState({
            status: 'error',
            threadId: resolvedThreadId,
            assistantMessage: {
              id: params.identifiers.assistantMessageId,
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
            id: data.assistantMessageId || params.identifiers.assistantMessageId,
            role: 'assistant',
            content: data.message,
            timestamp: new Date(),
            searchMetadata: data.search?.metadata ?? null,
          },
          resolvedUserMessageId: data.userMessageId,
        });
      } catch (error) {
        finalizeThreadState({
          status: 'error',
          threadId: params.requestThreadId,
          assistantMessage: {
            id: params.identifiers.assistantMessageId,
            role: 'assistant',
            content: error instanceof Error ? error.message : 'Something went wrong.',
            timestamp: new Date(),
          },
        });
      }
    },
    [
      activeMessages,
      chatRunCoordinator,
      persistThreadResult,
      selectedModelEffort,
      responseStyle,
      replaceThreadResultId,
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

      const identifiers = createChatRunIdentifiers('thread');
      const requestThreadId = identifiers.threadId ?? crypto.randomUUID();
      const userMessage: ThreadMessage = {
        id: identifiers.userMessageId,
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

      persistThreadResult(
        { selection, source },
        requestThreadId,
        session.messages,
        'loading'
      );

      void sendThreadRequest({
        sessionId: session.sessionId,
        question: trimmedQuestion,
        selection,
        source,
        requestThreadId,
        previousMessages: [],
        optimisticMessages: session.messages,
        optimisticUserMessageId: userMessage.id,
        identifiers,
        isNewThread: true,
      });
    },
    [
      activeConversationId,
      buildThreadSession,
      createThreadSession,
      persistThreadResult,
      selectedChat,
      sendThreadRequest,
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

      const identifiers = createChatRunIdentifiers(session.threadId ? 'main' : 'thread');
      const requestThreadId = session.threadId ?? identifiers.threadId ?? crypto.randomUUID();
      const userMessage: ThreadMessage = {
        id: identifiers.userMessageId,
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

      persistThreadResult(
        { selection, source: session },
        requestThreadId,
        nextMessages,
        'loading'
      );

      void sendThreadRequest({
        sessionId,
        question: content,
        selection,
        source: session,
        requestThreadId,
        previousMessages: session.messages,
        optimisticMessages: nextMessages,
        optimisticUserMessageId: userMessage.id,
        identifiers,
        isNewThread: !session.threadId,
      });
    },
    [
      activeConversationId,
      persistThreadResult,
      selectedChat,
      sendThreadRequest,
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

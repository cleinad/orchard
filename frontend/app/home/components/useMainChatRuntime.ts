"use client";

import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import {
  type SelectedChat,
  type PersistentDraftChat,
  type TemporaryChatSession,
} from '@/app/home/components/HomeDataContext';
import {
  applyUserMessageToTree,
  type PendingBranchTarget,
} from '@/app/home/components/conversationTree';
import {
  getSelectedChatKey,
  isSameSelectedChat,
} from '@/app/home/components/homeSelection';
import { logResolvedChatModel } from '@/app/home/components/logResolvedChatModel';
import type { ThreadMeta } from '@/app/home/components/threadTypes';
import type {
  BranchSelectionMap,
  ConversationBranch,
  Message,
} from '@/app/home/types';
import type { SearchMetadata, SearchMode } from '@/lib/chat-search';
import type { SearchActivitySummary } from '@/lib/search/types';
import {
  createTemporaryId,
  DEFAULT_TEMPORARY_MEMORY_MODE,
  fallbackChatTitleFromMessage,
  toChatHistory,
} from '@/lib/chat-session';
import { getBrowserTimeZone } from '@/lib/browser-timezone';
import { stripCitationMarkers } from '@/lib/search-citations';

export interface ChatResponse {
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
  searchActivity?: SearchActivitySummary | null;
  error?: string;
}

interface ReadChatStreamOptions {
  onTextEnd?: (content: string) => void;
  onSearchActivity?: (activity: SearchActivitySummary) => void;
}

interface PendingChatRequest {
  selection: SelectedChat;
  userMessageId: string;
  phase: 'awaiting-response' | 'reconciling';
}

/**
 * Reads an AI SDK v6 UI message stream response (SSE format).
 * Calls onChunk with each text delta as tokens arrive.
 * Returns the metadata object sent in the final data-chatMeta part.
 */
export async function readChatStream(
  response: Response,
  onChunk: (delta: string) => void,
  options: ReadChatStreamOptions = {}
): Promise<ChatResponse> {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return (await response.json()) as ChatResponse;
  }

  if (!response.body) {
    throw new Error('No response body');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let metadata: ChatResponse = {};
  let streamedContent = '';
  let buffer = '';
  let textEnded = false;

  const finishVisibleText = () => {
    if (textEnded) {
      return;
    }

    textEnded = true;
    options.onTextEnd?.(streamedContent);
  };

  const processEvent = (event: Record<string, unknown>) => {
    if (event.type === 'text-delta' && typeof event.delta === 'string') {
      if (event.delta) {
        streamedContent += event.delta;
        onChunk(event.delta);
      }
    } else if (event.type === 'text-end' || event.type === 'finish') {
      finishVisibleText();
    } else if (event.type === 'data-chatMeta' && event.data) {
      metadata = event.data as ChatResponse;
    } else if (event.type === 'data-searchActivity' && event.data) {
      const activity = event.data as SearchActivitySummary;
      metadata = { ...metadata, searchActivity: activity };
      options.onSearchActivity?.(activity);
    } else if (event.type === 'error' && typeof event.errorText === 'string') {
      metadata = { error: event.errorText };
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        buffer += decoder.decode();
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6).trim();
        if (!payload || payload === '[DONE]') continue;

        try {
          const event = JSON.parse(payload) as Record<string, unknown>;

          processEvent(event);
        } catch {
          // Ignore malformed SSE lines
        }
      }
    }

    if (buffer.startsWith('data: ')) {
      const payload = buffer.slice(6).trim();

      if (payload && payload !== '[DONE]') {
        try {
          const event = JSON.parse(payload) as Record<string, unknown>;

          processEvent(event);
        } catch {
          // Ignore malformed trailing SSE line
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  finishVisibleText();

  return metadata;
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

function sortMessagesForRender(messages: Message[]) {
  return [...messages].sort((a, b) => {
    const byTime = a.timestamp.getTime() - b.timestamp.getTime();
    if (byTime !== 0) {
      return byTime;
    }

    return a.id.localeCompare(b.id);
  });
}

function isLikelySamePersistedMessage(a: Message, b: Message) {
  return (
    a.role === b.role
    && a.content === b.content
    && Math.abs(a.timestamp.getTime() - b.timestamp.getTime()) < 60_000
  );
}

function getSearchActivityFromMessage(message: Message) {
  return (
    message.searchActivity
    ?? (message.searchMetadata?.version === 2 ? message.searchMetadata.activity ?? null : null)
  );
}

function mergeReloadedMessagesForRender(params: {
  loadedMessages: Message[];
  currentMessages: Message[];
}) {
  const currentById = new Map(params.currentMessages.map((message) => [message.id, message]));
  const usedCurrentRenderIds = new Set<string>();

  const mergedLoadedMessages = params.loadedMessages.map((loadedMessage) => {
    const currentByExactId = currentById.get(loadedMessage.id) ?? null;
    const currentMessage =
      currentByExactId
      ?? params.currentMessages.find((candidate) => {
        const candidateRenderId = candidate.renderId ?? candidate.id;

        return (
          !usedCurrentRenderIds.has(candidateRenderId)
          && isLikelySamePersistedMessage(candidate, loadedMessage)
        );
      })
      ?? null;

    if (!currentMessage) {
      return loadedMessage;
    }

    usedCurrentRenderIds.add(currentMessage.renderId ?? currentMessage.id);

    if (!currentMessage.renderId) {
      return loadedMessage;
    }

    return {
      ...loadedMessage,
      renderId: currentMessage.renderId,
      searchMetadata: currentMessage.searchMetadata ?? loadedMessage.searchMetadata ?? null,
      searchActivity:
        getSearchActivityFromMessage(currentMessage)
        ?? getSearchActivityFromMessage(loadedMessage),
    };
  });

  const loadedIds = new Set(params.loadedMessages.map((message) => message.id));
  const localMessagesMissingFromReload = params.currentMessages.filter((message) => {
    const renderId = message.renderId ?? message.id;

    return !usedCurrentRenderIds.has(renderId) && !loadedIds.has(message.id);
  });

  return sortMessagesForRender([...mergedLoadedMessages, ...localMessagesMissingFromReload]);
}

function scheduleDeferredRenderWork(callback: () => void) {
  const run = () => {
    startTransition(callback);
  };

  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    window.requestIdleCallback(run, { timeout: 1_000 });
    return;
  }

  globalThis.setTimeout(run, 350);
}

interface LoadedConversationMessages {
  messages: Message[];
  branches: ConversationBranch[];
  selectedBranchIds: BranchSelectionMap;
  threadsMap: Map<string, ThreadMeta[]>;
}

interface MainChatRuntimeParams {
  activeMessages: Message[];
  autoSendTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  clearComposerInputForSelection: (selection: SelectedChat | null) => void;
  clearPendingChatRequestForSelection: (selection: SelectedChat) => void;
  clearSearchStateForSelection: (selection: SelectedChat | null) => void;
  getOrCreateDraft: (mentorId: string | null) => PersistentDraftChat;
  hydratedRouteConversationIdRef: MutableRefObject<string | null>;
  isHomeE2eFixture: boolean;
  loadConversationMessages: (id: string) => Promise<LoadedConversationMessages>;
  movePendingChatRequestBetweenSelections: (
    fromSelection: SelectedChat,
    toSelection: SelectedChat
  ) => void;
  moveSearchModeBetweenSelections: (
    fromSelection: SelectedChat | null,
    toSelection: SelectedChat | null
  ) => void;
  pendingBranch: PendingBranchTarget | null;
  pendingChatRequestsRef: MutableRefObject<Record<string, PendingChatRequest>>;
  persistentBranches: ConversationBranch[];
  persistentMessages: Message[];
  persistentSelectedBranchIds: BranchSelectionMap;
  persistentSelectedBranchIdsRef: MutableRefObject<BranchSelectionMap>;
  refreshSidebarData: () => Promise<void>;
  searchMode: SearchMode;
  selectedChat: SelectedChat | null;
  selectedChatRef: MutableRefObject<SelectedChat | null>;
  selectedDraftChat: PersistentDraftChat | null;
  selectedModelId: string;
  selectedTemporaryChat: TemporaryChatSession | null;
  setDraftChats: Dispatch<SetStateAction<PersistentDraftChat[]>>;
  setListError: (error: string | null) => void;
  setPendingBranch: Dispatch<SetStateAction<PendingBranchTarget | null>>;
  setPendingChatRequestForSelection: (
    selection: SelectedChat,
    request: PendingChatRequest | null
  ) => void;
  setPendingChatRequestPhaseForSelection: (
    selection: SelectedChat,
    phase: PendingChatRequest['phase']
  ) => void;
  setPersistentBranches: Dispatch<SetStateAction<ConversationBranch[]>>;
  setPersistentMessages: Dispatch<SetStateAction<Message[]>>;
  setPersistentSelectedBranchIds: Dispatch<SetStateAction<BranchSelectionMap>>;
  setPersistentThreadsMap: Dispatch<SetStateAction<Map<string, ThreadMeta[]>>>;
  replacePersistentConversationUrl: (id: string) => void;
  setSearchStateForSelection: (selection: SelectedChat | null, state: SearchMetadata | null) => void;
  setSelectedChat: Dispatch<SetStateAction<SelectedChat | null>>;
  setUserHasScrolledState: (nextValue: boolean) => void;
  temporaryChatsRef: MutableRefObject<TemporaryChatSession[]>;
  tempChatTitle: string;
  transcription: { clearTranscript: () => void };
  tts: { speak: (text: string) => void };
  ttsEnabled: boolean;
  updateDraftChat: (id: string, updater: (draft: PersistentDraftChat) => PersistentDraftChat) => void;
  updateTemporaryChat: (
    id: string,
    updater: (chat: TemporaryChatSession) => TemporaryChatSession
  ) => void;
}

export function useMainChatRuntime(params: MainChatRuntimeParams) {
  const paramsRef = useRef(params);

  useEffect(() => {
    paramsRef.current = params;
  }, [params]);

  return useCallback(async (content: string) => {
    const params = paramsRef.current;
    const messageText = content.trim();
    if (!messageText) {
      return;
    }

    if (params.autoSendTimerRef.current) {
      clearTimeout(params.autoSendTimerRef.current);
      params.autoSendTimerRef.current = null;
    }
    params.transcription.clearTranscript();

    const now = new Date();
    const nextUpdatedAt = now.toISOString();

    let effectiveSelection = params.selectedChat as SelectedChat;
    let effectiveDraft = params.selectedDraftChat;
    const effectiveTempChat = params.selectedTemporaryChat;
    const effectivePendingBranch = params.pendingBranch;
    const activePathTailMessageId =
      params.activeMessages[params.activeMessages.length - 1]?.id ?? null;
    const previousMessageId = effectivePendingBranch?.sourceMessageId ?? activePathTailMessageId;
    const branchSourceMessageId = effectivePendingBranch?.sourceMessageId ?? null;

    if (!effectiveSelection) {
      effectiveDraft = params.getOrCreateDraft(null);
      effectiveSelection = {
        kind: 'draft',
        draftId: effectiveDraft.id,
        mentorId: null,
      };
      params.selectedChatRef.current = effectiveSelection;
      params.setSelectedChat(effectiveSelection);
    }

    if (!effectiveSelection) {
      return;
    }

    const effectiveSelectionKey = getSelectedChatKey(effectiveSelection);
    if (!effectiveSelectionKey || params.pendingChatRequestsRef.current[effectiveSelectionKey]) {
      return;
    }

    const userMessage: Message = {
      id:
        effectiveSelection.kind === 'temporary'
          ? createTemporaryId('message')
          : Date.now().toString(),
      renderId: createTemporaryId('render'),
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
            messages: params.persistentMessages,
            branches: params.persistentBranches,
            selectedBranchIds: params.persistentSelectedBranchIds,
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
      params.updateTemporaryChat(effectiveSelection.tempChatId, (chat) => {
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
      params.setPersistentMessages(nextTree.messages);
      params.setPersistentBranches(nextTree.branches);
      params.setPersistentSelectedBranchIds(nextTree.selectedBranchIds);
    } else {
      const draft = effectiveDraft || params.getOrCreateDraft(effectiveSelection.mentorId);
      effectiveDraft = draft;
      const nextTree = draftNextTree;
      if (!nextTree) {
        return;
      }
      params.updateDraftChat(draft.id, (currentDraft) => ({
        ...currentDraft,
        messages: nextTree.messages,
        branches: nextTree.branches,
        selectedBranchIds: nextTree.selectedBranchIds,
        updatedAt: nextUpdatedAt,
      }));
    }

    params.setPendingBranch(null);
    params.clearComposerInputForSelection(effectiveSelection);
    params.setPendingChatRequestForSelection(effectiveSelection, {
      selection: effectiveSelection,
      userMessageId: userMessage.id,
      phase: 'awaiting-response',
    });
    params.clearSearchStateForSelection(effectiveSelection);
    params.setUserHasScrolledState(false);

    const streamingMessageId =
      effectiveSelection.kind === 'temporary'
        ? createTemporaryId('message')
        : `streaming-${Date.now()}`;
    const streamingMessage: Message = {
      id: streamingMessageId,
      renderId: streamingMessageId,
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
      params.updateTemporaryChat(effectiveSelection.tempChatId, (chat) => ({
        ...addStreamingMessage(chat),
        updatedAt: new Date().toISOString(),
      }));
    } else if (effectiveSelection.kind === 'persistent') {
      if (isSameSelectedChat(params.selectedChatRef.current, effectiveSelection)) {
        params.setPersistentMessages((prev) => [...prev, streamingMessage]);
      }
    } else if (effectiveDraft) {
      params.updateDraftChat(effectiveDraft.id, (draft) => addStreamingMessage(draft));
    }

    let latestStreamedContent = '';
    let visibleAssistantContent = '';
    let visibleAssistantMessage: Message | null = null;
    let visibleFinalized = false;
    let latestSearchActivity: SearchActivitySummary | null = null;

    const appendChunk = (delta: string) => {
      latestStreamedContent += delta;

      if (effectiveSelection.kind === 'temporary') {
        params.updateTemporaryChat(effectiveSelection.tempChatId, (chat) => ({
          ...chat,
          messages: chat.messages.map((m) =>
            m.id === streamingMessageId ? { ...m, content: m.content + delta } : m
          ),
        }));
      } else if (effectiveSelection.kind === 'persistent') {
        if (isSameSelectedChat(params.selectedChatRef.current, effectiveSelection)) {
          params.setPersistentMessages((prev) =>
            prev.map((m) =>
              m.id === streamingMessageId ? { ...m, content: m.content + delta } : m
            )
          );
        }
      } else if (effectiveDraft) {
        params.updateDraftChat(effectiveDraft.id, (draft) => ({
          ...draft,
          messages: draft.messages.map((m) =>
            m.id === streamingMessageId ? { ...m, content: m.content + delta } : m
          ),
        }));
      }
    };

    const updateSearchActivity = (activity: SearchActivitySummary) => {
      latestSearchActivity = activity;

      const applyActivity = (messages: Message[]) =>
        messages.map((message) =>
          message.id === streamingMessageId || message.renderId === streamingMessageId
            ? { ...message, searchActivity: activity }
            : message
        );

      if (effectiveSelection.kind === 'temporary') {
        params.updateTemporaryChat(effectiveSelection.tempChatId, (chat) => ({
          ...chat,
          messages: applyActivity(chat.messages),
        }));
      } else if (effectiveSelection.kind === 'persistent') {
        if (isSameSelectedChat(params.selectedChatRef.current, effectiveSelection)) {
          params.setPersistentMessages((prev) => applyActivity(prev));
        }
      } else if (effectiveDraft) {
        params.updateDraftChat(effectiveDraft.id, (draft) => ({
          ...draft,
          messages: applyActivity(draft.messages),
        }));
      }
    };

    const replaceStreamingMessage = (finalMessage: Message) => {
      if (effectiveSelection.kind === 'temporary') {
        params.updateTemporaryChat(effectiveSelection.tempChatId, (chat) => ({
          ...chat,
          messages: chat.messages.map((m) =>
            m.id === streamingMessageId || m.renderId === streamingMessageId ? finalMessage : m
          ),
        }));
      } else if (effectiveSelection.kind === 'persistent') {
        if (isSameSelectedChat(params.selectedChatRef.current, effectiveSelection)) {
          params.setPersistentMessages((prev) =>
            prev.map((m) =>
              m.id === streamingMessageId || m.renderId === streamingMessageId ? finalMessage : m
            )
          );
        }
      } else if (effectiveDraft) {
        params.updateDraftChat(effectiveDraft.id, (draft) => ({
          ...draft,
          messages: draft.messages.map((m) =>
            m.id === streamingMessageId || m.renderId === streamingMessageId ? finalMessage : m
          ),
        }));
      }
    };

    const finalizeVisibleAssistant = (content: string) => {
      if (visibleFinalized) {
        return visibleAssistantMessage;
      }

      visibleFinalized = true;
      visibleAssistantMessage = {
        id: streamingMessageId,
        renderId: streamingMessageId,
        role: 'assistant',
        content,
        timestamp: new Date(),
        searchMetadata: null,
        searchActivity: latestSearchActivity,
        previousMessageId: userMessage.id,
      };
      visibleAssistantContent = content;

      params.setPendingChatRequestPhaseForSelection(effectiveSelection, 'reconciling');
      replaceStreamingMessage(visibleAssistantMessage);

      return visibleAssistantMessage;
    };

    const removeStreamingMessage = () => {
      if (effectiveSelection.kind === 'temporary') {
        params.updateTemporaryChat(effectiveSelection.tempChatId, (chat) => ({
          ...chat,
          messages: chat.messages.filter((m) => m.id !== streamingMessageId),
        }));
      } else if (effectiveSelection.kind === 'persistent') {
        if (isSameSelectedChat(params.selectedChatRef.current, effectiveSelection)) {
          params.setPersistentMessages((prev) =>
            prev.filter((m) => m.id !== streamingMessageId)
          );
        }
      } else if (effectiveDraft) {
        params.updateDraftChat(effectiveDraft.id, (draft) => ({
          ...draft,
          messages: draft.messages.filter((m) => m.id !== streamingMessageId),
        }));
      }
    };

    const canApplyTemporaryResponseForSelection = (selection: SelectedChat) =>
      selection.kind !== 'temporary'
      || params.temporaryChatsRef.current.some((chat) => chat.id === selection.tempChatId);

    const showErrorMessage = (errorText: string) => {
      const canApplyTemporaryResponse =
        canApplyTemporaryResponseForSelection(effectiveSelection);

      if (!canApplyTemporaryResponse) {
        return;
      }

      removeStreamingMessage();
      const errorMessage: Message = {
        id:
          effectiveSelection.kind === 'temporary'
            ? createTemporaryId('message')
            : (Date.now() + 1).toString(),
        renderId: streamingMessageId,
        role: 'assistant',
        content: `Something went wrong. ${errorText || ''}`.trim(),
        timestamp: new Date(),
        previousMessageId: userMessage.id,
      };

      if (effectiveSelection.kind === 'temporary') {
        params.updateTemporaryChat(effectiveSelection.tempChatId, (chat) => ({
          ...chat,
          messages: [...chat.messages, errorMessage],
          updatedAt: new Date().toISOString(),
        }));
      } else if (effectiveSelection.kind === 'persistent') {
        if (isSameSelectedChat(params.selectedChatRef.current, effectiveSelection)) {
          params.setPersistentMessages((prev) => [...prev, errorMessage]);
        }
      } else if (effectiveDraft) {
        params.updateDraftChat(effectiveDraft.id, (draft) => ({
          ...draft,
          messages: [...draft.messages, errorMessage],
          updatedAt: new Date().toISOString(),
        }));
      }
    };

    const attachSearchMetadata = (
      selection: SelectedChat,
      messageId: string,
      renderId: string,
      searchMetadata: Message['searchMetadata']
    ) => {
      if (!searchMetadata) {
        return;
      }

      const applyMetadata = (messages: Message[]) =>
        messages.map((message) =>
          message.id === messageId || message.renderId === renderId
            ? { ...message, searchMetadata }
            : message
        );

      scheduleDeferredRenderWork(() => {
        if (selection.kind === 'temporary') {
          params.updateTemporaryChat(selection.tempChatId, (chat) => ({
            ...chat,
            messages: applyMetadata(chat.messages),
          }));
          return;
        }

        if (selection.kind === 'draft') {
          params.updateDraftChat(selection.draftId, (draft) => ({
            ...draft,
            messages: applyMetadata(draft.messages),
          }));
          return;
        }

        if (isSameSelectedChat(params.selectedChatRef.current, selection)) {
          params.setPersistentMessages((messages) => applyMetadata(messages));
        }
      });
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
          modelId: params.selectedModelId,
          previousMessageId,
          branchSourceMessageId: branchSourceMessageId ?? undefined,
          searchMode: params.searchMode,
          timezone: getBrowserTimeZone(),
          chatMode:
            effectiveSelection.kind === 'temporary' ? 'temporary' : 'persistent',
          ...(effectiveSelection.kind === 'temporary'
            ? {
                memoryMode:
                  effectiveTempChat?.memoryMode ?? DEFAULT_TEMPORARY_MEMORY_MODE,
                history: toChatHistory(params.activeMessages),
              }
            : {}),
        }),
      });

      if (!response.ok) {
        const data = (await response.json()) as ChatResponse;
        showErrorMessage(data.error || '');
        return;
      }

      const data = await readChatStream(response, appendChunk, {
        onSearchActivity: updateSearchActivity,
        onTextEnd: (content) => {
          const canApplyTemporaryResponse =
            canApplyTemporaryResponseForSelection(effectiveSelection);

          if (canApplyTemporaryResponse) {
            finalizeVisibleAssistant(content || latestStreamedContent);
          }
        },
      });
      logResolvedChatModel(data, 'composer');

      const canApplyTemporaryResponse =
        canApplyTemporaryResponseForSelection(effectiveSelection);

      if (data.error) {
        showErrorMessage(data.error);
        return;
      }

      scheduleDeferredRenderWork(() => {
        if (canApplyTemporaryResponse) {
          params.setSearchStateForSelection(effectiveSelection, data.search ?? null);
        }
      });

      const finalSearchMetadata = data.search?.metadata ?? null;
      const finalSearchActivity =
        data.searchActivity
        ?? (finalSearchMetadata?.version === 2
          ? finalSearchMetadata.activity ?? latestSearchActivity
          : latestSearchActivity);
      const visibleContent = visibleAssistantContent || latestStreamedContent;
      const assistantMessage: Message = {
        id:
          effectiveSelection.kind === 'temporary'
            ? streamingMessageId
            : data.assistantMessageId || (Date.now() + 1).toString(),
        renderId: streamingMessageId,
        role: 'assistant',
        content: data.message ?? visibleContent,
        timestamp: new Date(),
        searchMetadata: null,
        searchActivity: finalSearchActivity,
        previousMessageId: userMessage.id,
      };

      if (!visibleFinalized) {
        finalizeVisibleAssistant(assistantMessage.content);
      }

      const identityAssistantMessage = {
        ...assistantMessage,
        content: visibleContent || assistantMessage.content,
      };

      replaceStreamingMessage(identityAssistantMessage);

      if (
        effectiveSelection.kind === 'draft'
        && effectiveDraft
        && typeof data.conversationId === 'string'
        && data.conversationId.length > 0
      ) {
        const draftSelection = effectiveSelection;
        const promotedDraftId = effectiveDraft.id;
        const promotedSelection: SelectedChat = {
          kind: 'persistent',
          conversationId: data.conversationId,
          mentorId: data.mentorId ?? draftSelection.mentorId,
        };
        const optimisticMessages = [
          ...(draftNextTree?.messages ?? effectiveDraft.messages),
          identityAssistantMessage,
        ];
        const shouldFocusPromotedDraft = isSameSelectedChat(
          params.selectedChatRef.current,
          draftSelection
        );

        params.movePendingChatRequestBetweenSelections(draftSelection, promotedSelection);
        params.moveSearchModeBetweenSelections(draftSelection, promotedSelection);
        params.clearSearchStateForSelection(draftSelection);

        if (shouldFocusPromotedDraft) {
          params.setPersistentMessages(optimisticMessages);
          params.setPersistentBranches(draftNextTree?.branches ?? effectiveDraft.branches);
          params.setPersistentSelectedBranchIds(
            draftNextTree?.selectedBranchIds ?? effectiveDraft.selectedBranchIds
          );
          params.setPersistentThreadsMap(new Map());
          params.hydratedRouteConversationIdRef.current = promotedSelection.conversationId;
          params.selectedChatRef.current = promotedSelection;
          params.setSelectedChat(promotedSelection);
          params.replacePersistentConversationUrl(promotedSelection.conversationId);
        }

        params.setDraftChats((prev) =>
          prev.filter((draft) => draft.id !== promotedDraftId)
        );

        if (shouldFocusPromotedDraft) {
          effectiveSelection = promotedSelection;
        }

        effectiveDraft = null;
      }

      if (assistantMessage.content !== identityAssistantMessage.content) {
        scheduleDeferredRenderWork(() => {
          replaceStreamingMessage(assistantMessage);
        });
      }

      if (effectiveSelection.kind === 'temporary') {
        if (!canApplyTemporaryResponse) {
          return;
        }

        params.updateTemporaryChat(effectiveSelection.tempChatId, (chat) => ({
          ...chat,
          title:
            data.conversationTitle ||
            fallbackChatTitleFromMessage(messageText, params.tempChatTitle),
          updatedAt: new Date().toISOString(),
        }));
      } else if (effectiveSelection.kind === 'persistent') {
        const persistentSelection = effectiveSelection;
        scheduleDeferredRenderWork(() => {
          void (async () => {
            try {
              if (isSameSelectedChat(params.selectedChatRef.current, persistentSelection)) {
                const loadedConversation = await params.loadConversationMessages(
                  persistentSelection.conversationId
                );

                if (isSameSelectedChat(params.selectedChatRef.current, persistentSelection)) {
                  const mergedSelections = mergeReloadedBranchSelections({
                    loadedSelectedBranchIds: loadedConversation.selectedBranchIds,
                    latestSelectedBranchIds: params.persistentSelectedBranchIdsRef.current,
                    loadedBranches: loadedConversation.branches,
                    branchSourceMessageId,
                    pendingBranchSelectionId,
                  });

                  params.setPersistentMessages((currentMessages) =>
                    mergeReloadedMessagesForRender({
                      loadedMessages: loadedConversation.messages,
                      currentMessages,
                    })
                  );
                  params.setPersistentBranches(loadedConversation.branches);
                  params.setPersistentSelectedBranchIds(mergedSelections);
                  params.setPersistentThreadsMap(loadedConversation.threadsMap);
                }
              }
            } catch (error) {
              if (isSameSelectedChat(params.selectedChatRef.current, persistentSelection)) {
                params.setListError(
                  error instanceof Error ? error.message : 'Failed to reload conversation'
                );
              }
            } finally {
              if (!params.isHomeE2eFixture) {
                void params.refreshSidebarData();
              }
            }
          })();
        });
      }

      attachSearchMetadata(
        effectiveSelection,
        assistantMessage.id,
        streamingMessageId,
        finalSearchMetadata
      );

      if (
        params.ttsEnabled
        && data.message
        && !data.message.startsWith('Something went wrong')
        && canApplyTemporaryResponse
      ) {
        params.tts.speak(stripCitationMarkers(data.message, finalSearchMetadata));
      }
    } catch {
      const canApplyTemporaryResponse =
        canApplyTemporaryResponseForSelection(effectiveSelection);

      if (canApplyTemporaryResponse) {
        replaceStreamingMessage({
          id:
            effectiveSelection.kind === 'temporary'
              ? streamingMessageId
              : (Date.now() + 1).toString(),
          renderId: streamingMessageId,
          role: 'assistant',
          content: 'Sorry, there was an error processing your message.',
          timestamp: new Date(),
          previousMessageId: userMessage.id,
        });
      }
    } finally {
      params.clearPendingChatRequestForSelection(effectiveSelection);
    }
  }, []);
}

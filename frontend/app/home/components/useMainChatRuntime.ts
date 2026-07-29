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
import type {
  PersistentConversationTranscript,
  PersistentConversationTranscriptInput,
} from '@/app/home/components/persistentConversationCache';
import {
  applyUserMessageToTree,
  type PendingBranchTarget,
} from '@/app/home/components/conversationTree';
import {
  getSelectedChatKey,
  isSameSelectedChat,
} from '@/app/home/components/homeSelection';
import { logResolvedChatModel } from '@/app/home/components/logResolvedChatModel';
import type { UploadedChatImageAttachment } from '@/app/home/components/chatImageUploads';
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
  fallbackChatTitleFromMessage,
  toChatHistory,
} from '@/lib/chat-session';
import { getBrowserTimeZone } from '@/lib/browser-timezone';
import type { ChatModelEffortLevel, ChatModelId } from '@/lib/chat-models';
import type { ResponseStyle } from '@/lib/response-style';
import { useOptionalChatRunCoordinator } from '@/app/components/ChatRunCoordinator';
import {
  createChatRunIdentifiers,
  createQueuedChatRunSnapshot,
  isSettledChatRunSnapshot,
  isTerminalChatRunStatus,
  type ChatRunSnapshot,
} from '@/lib/chat-runs/protocol';
import { mergeThreadsMaps } from '@/app/home/components/persistentThreadRuntime';
import {
  getDraftSelectionForPromotion,
  isDefinitivePreAcceptanceFailure,
  loadProvisionalChatPromotion,
  removeProvisionalChatPromotion,
  storeProvisionalChatPromotion,
  type ProvisionalChatPromotion,
} from '@/app/home/components/provisionalChatPromotion';

export interface ChatResponse {
  message?: string;
  conversationId?: string;
  conversationTitle?: string | null;
  mentorId?: string | null;
  workspaceId?: string | null;
  threadId?: string | null;
  userMessageId?: string | null;
  assistantMessageId?: string | null;
  resolvedModelId?: string;
  resolvedProvider?: string;
  search?: SearchMetadata;
  searchActivity?: SearchActivitySummary | null;
  error?: string;
  cancelled?: boolean;
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

interface SendMessageOptions {
  displayAttachments?: Message['attachments'];
  uploadedAttachments?: UploadedChatImageAttachment[];
  prepareUploadedAttachments?: () => Promise<UploadedChatImageAttachment[]>;
  modelId?: ChatModelId;
  modelEffort?: ChatModelEffortLevel | null;
  thinkingEnabled?: boolean | null;
  responseStyle?: ResponseStyle;
  searchMode?: SearchMode;
}

interface SendMessageResult {
  accepted: boolean;
  completed: boolean;
  error?: string;
  restoreComposerSelection?: SelectedChat | null;
  uploadedAttachments?: UploadedChatImageAttachment[];
  cleanupUploadedAttachments?: UploadedChatImageAttachment[];
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

export function mergeReloadedBranchSelections(params: {
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

function resolveStateAction<T>(action: SetStateAction<T>, current: T): T {
  return typeof action === 'function'
    ? (action as (previous: T) => T)(current)
    : action;
}

interface LoadedConversationMessages {
  messages: Message[];
  branches: ConversationBranch[];
  selectedBranchIds: BranchSelectionMap;
  threadsMap: Map<string, ThreadMeta[]>;
}

interface MainChatRuntimeParams {
  activeMessages: Message[];
  clearComposerInputForSelection: (selection: SelectedChat | null) => void;
  clearPendingChatRequestForSelection: (selection: SelectedChat) => void;
  clearSearchStateForSelection: (selection: SelectedChat | null) => void;
  getOrCreateDraft: (mentorId: string | null, workspaceId?: string | null) => PersistentDraftChat;
  hydratedRouteConversationId: string | null;
  hydratedRouteConversationIdRef: MutableRefObject<string | null>;
  isHomeE2eFixture: boolean;
  loadConversationMessages: (id: string) => Promise<LoadedConversationMessages>;
  movePendingChatRequestBetweenSelections: (
    fromSelection: SelectedChat,
    toSelection: SelectedChat
  ) => void;
  moveResponseStyleBetweenSelections: (
    fromSelection: SelectedChat | null,
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
  refreshSidebarData: () => Promise<void>;
  upsertSidebarConversation: (conversation: {
    id: string;
    title?: string | null;
    mentorId?: string | null;
    workspaceId?: string | null;
    updatedAt?: string | null;
    createdAt?: string | null;
  }) => void;
  responseStyle: ResponseStyle;
  searchMode: SearchMode;
  selectedChat: SelectedChat | null;
  selectedChatRef: MutableRefObject<SelectedChat | null>;
  selectedDraftChat: PersistentDraftChat | null;
  selectedModelId: string;
  selectedModelEffort: ChatModelEffortLevel | null;
  thinkingEnabled: boolean | null;
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
  setPersistentConversationTranscript: (
    conversationId: string,
    transcript: PersistentConversationTranscriptInput
  ) => void;
  updatePersistentConversationTranscript: (
    conversationId: string,
    updater: (
      transcript: PersistentConversationTranscript
    ) => PersistentConversationTranscript
  ) => void;
  replacePersistentConversationUrl: (id: string) => void;
  rollbackProvisionalChatPromotion: (runId: string) => Extract<
    SelectedChat,
    { kind: 'draft' }
  > | null;
  setComposerInputForSelection: (
    selection: SelectedChat | null,
    value: string
  ) => void;
  setSearchStateForSelection: (selection: SelectedChat | null, state: SearchMetadata | null) => void;
  setSelectedChat: Dispatch<SetStateAction<SelectedChat | null>>;
  setUserHasScrolledState: (nextValue: boolean) => void;
  temporaryChatsRef: MutableRefObject<TemporaryChatSession[]>;
  tempChatTitle: string;
  updateDraftChat: (id: string, updater: (draft: PersistentDraftChat) => PersistentDraftChat) => void;
  updateTemporaryChat: (
    id: string,
    updater: (chat: TemporaryChatSession) => TemporaryChatSession
  ) => void;
}

function mapUploadedAttachments(
  attachments: UploadedChatImageAttachment[]
): NonNullable<Message['attachments']> {
  return attachments.map((attachment) => ({
    id: attachment.id,
    storagePath: attachment.storagePath,
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    width: attachment.width,
    height: attachment.height,
    url: attachment.url,
  }));
}

export function useMainChatRuntime(params: MainChatRuntimeParams) {
  const chatRunCoordinator = useOptionalChatRunCoordinator();
  const paramsRef = useRef(params);
  const appliedRunVersionsRef = useRef(new Set<string>());

  useEffect(() => {
    paramsRef.current = params;
  }, [params]);

  useEffect(() => {
    // Route hydration can replace a locally recovered placeholder. Re-apply
    // the latest authoritative run snapshot after that hydration boundary.
    if (params.hydratedRouteConversationId) {
      appliedRunVersionsRef.current.clear();
    }
  }, [params.hydratedRouteConversationId]);

  useEffect(() => {
    if (!chatRunCoordinator) return;
    const selected = params.selectedChat;
    const chatId = selected?.kind === 'persistent'
      ? selected.conversationId
      : selected?.kind === 'temporary'
        ? selected.tempChatId
        : selected?.kind === 'draft'
          ? selected.draftId
          : null;
    if (!chatId) return;

    const applySnapshot = (run: ChatRunSnapshot) => {
      if (run.acceptedAt) {
        removeProvisionalChatPromotion(run.runId);
      }
      const current = paramsRef.current;
      if (isDefinitivePreAcceptanceFailure(run)) {
        const promotion = loadProvisionalChatPromotion(run.runId);
        if (promotion) {
          const promotedSelection: SelectedChat = {
            kind: 'persistent',
            conversationId: promotion.conversationId,
            mentorId: promotion.draft.mentorId,
            workspaceId: promotion.draft.workspaceId,
          };
          const promotionKey = getSelectedChatKey(promotedSelection);
          const wasLocallySubmitting = Boolean(
            promotionKey
            && current.pendingChatRequestsRef.current[promotionKey]
          );
          const wasViewingPromotion = window.location.pathname
            === `/home/${encodeURIComponent(promotion.conversationId)}`;
          const draftSelection =
            current.rollbackProvisionalChatPromotion(run.runId)
            ?? getDraftSelectionForPromotion(promotion);
          current.moveResponseStyleBetweenSelections(
            promotedSelection,
            draftSelection
          );
          current.setComposerInputForSelection(draftSelection, promotion.prompt);
          if (wasViewingPromotion && !wasLocallySubmitting) {
            current.setListError(run.errorMessage ?? 'The request was not accepted.');
          }
          chatRunCoordinator.dismiss(run.runId);
          return;
        }
      }
      if (run.target.chatId !== chatId || run.target.kind === 'thread') return;
      if (
        run.mode === 'persistent'
        && current.selectedChat?.kind === 'persistent'
        && current.hydratedRouteConversationIdRef.current !== chatId
      ) {
        return;
      }
      const versionKey = `${run.runId}:${run.status}:${run.updatedAt}`;
      if (appliedRunVersionsRef.current.has(versionKey)) return;
      appliedRunVersionsRef.current.add(versionKey);

      if (run.mode === 'temporary') {
        current.updateTemporaryChat(chatId, (chat) => {
          const existingAssistant = chat.messages.find(
            (message) => message.id === run.assistantMessageId
          );
          const withoutAssistant = chat.messages.filter(
            (message) => message.id !== run.assistantMessageId
          );
          if (run.status === 'cancelled') {
            return { ...chat, messages: withoutAssistant };
          }
          const assistant: Message = {
            id: run.assistantMessageId,
            renderId: run.assistantMessageId,
            role: 'assistant',
            content: run.response
              ?? (run.status === 'failed' || run.status === 'interrupted'
                ? run.errorMessage ?? 'The temporary response was interrupted.'
                : existingAssistant?.content ?? ''),
            timestamp: new Date(run.updatedAt),
            previousMessageId: run.userMessageId,
            isStreaming: !isSettledChatRunSnapshot(run),
            isError: run.status === 'failed' || run.status === 'interrupted',
            searchMetadata: run.search?.metadata ?? null,
            searchActivity: run.searchActivity,
          };
          return {
            ...chat,
            title: run.title.value ?? chat.title,
            messages: [...withoutAssistant, assistant],
            updatedAt: run.updatedAt,
          };
        });
        return;
      }

      if (
        run.mode === 'persistent'
        && run.status !== 'interrupted'
        && !isTerminalChatRunStatus(run.status)
      ) {
        current.updatePersistentConversationTranscript(chatId, (transcript) => {
          const existingAssistant = transcript.messages.find(
            (message) => message.id === run.assistantMessageId
          );
          const nextAssistant: Message = {
            id: run.assistantMessageId,
            renderId: existingAssistant?.renderId ?? run.assistantMessageId,
            role: 'assistant',
            content: run.response
              ?? (existingAssistant?.isError ? '' : existingAssistant?.content ?? ''),
            timestamp: new Date(run.updatedAt),
            previousMessageId: run.userMessageId,
            isStreaming: true,
            isError: false,
          };
          return {
            ...transcript,
            messages: [
              ...transcript.messages.filter(
                (message) => message.id !== run.assistantMessageId
              ),
              nextAssistant,
            ],
          };
        });
        return;
      }

      if (run.status === 'completed') {
        void current.loadConversationMessages(chatId).then((loaded) => {
          current.updatePersistentConversationTranscript(chatId, (transcript) => ({
            ...transcript,
            messages: mergeReloadedMessagesForRender({
              loadedMessages: loaded.messages,
              currentMessages: transcript.messages.filter(
                (message) => message.id !== run.assistantMessageId || !message.isStreaming
              ),
            }),
            branches: loaded.branches,
            selectedBranchIds: mergeReloadedBranchSelections({
              loadedSelectedBranchIds: loaded.selectedBranchIds,
              latestSelectedBranchIds: transcript.selectedBranchIds,
              loadedBranches: loaded.branches,
              branchSourceMessageId: run.target.branchSourceMessageId,
              pendingBranchSelectionId: run.target.branchId,
            }),
            threadsMap: mergeThreadsMaps(loaded.threadsMap, transcript.threadsMap),
          }));
          void current.refreshSidebarData();
        }).catch(() => null);
        return;
      }

      current.updatePersistentConversationTranscript(chatId, (transcript) => {
        const withoutPlaceholder = transcript.messages.filter(
          (message) => message.id !== run.assistantMessageId
        );
        if (run.status === 'cancelled') {
          return { ...transcript, messages: withoutPlaceholder };
        }
        return {
          ...transcript,
          messages: [
            ...withoutPlaceholder,
            {
              id: run.assistantMessageId,
              renderId: run.assistantMessageId,
              role: 'assistant',
              content: run.errorMessage ?? 'Something went wrong.',
              timestamp: new Date(run.updatedAt),
              previousMessageId: run.userMessageId,
              isError: true,
            },
          ],
        };
      });
    };

    return chatRunCoordinator.subscribeAll(applySnapshot);
  }, [
    chatRunCoordinator,
    params.hydratedRouteConversationId,
    params.selectedChat,
  ]);

  return useCallback(async (
    content: string,
    options: SendMessageOptions = {}
  ): Promise<SendMessageResult> => {
    const params = paramsRef.current;
    const messageText = content.trim();
    let uploadedAttachments = options.uploadedAttachments ?? [];
    const displayAttachments =
      options.displayAttachments ?? mapUploadedAttachments(uploadedAttachments);
    const requestModelId = options.modelId ?? params.selectedModelId;
    const requestModelEffort =
      options.modelEffort === undefined ? params.selectedModelEffort : options.modelEffort;
    const requestThinkingEnabled =
      options.thinkingEnabled === undefined ? params.thinkingEnabled : options.thinkingEnabled;
    const requestResponseStyle = options.responseStyle ?? params.responseStyle;
    const requestSearchMode = options.searchMode ?? params.searchMode;

    if (!messageText && displayAttachments.length === 0 && uploadedAttachments.length === 0) {
      return { accepted: false, completed: false };
    }

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
    const runIdentifiers = createChatRunIdentifiers(
      branchSourceMessageId ? 'branch' : 'main'
    );

    if (!effectiveSelection) {
      const blankSelection = params.selectedChat;
      effectiveDraft = params.getOrCreateDraft(null);
      effectiveSelection = {
        kind: 'draft',
        draftId: effectiveDraft.id,
        mentorId: null,
        workspaceId: null,
      };
      params.moveResponseStyleBetweenSelections(blankSelection, effectiveSelection);
      params.selectedChatRef.current = effectiveSelection;
      params.setSelectedChat(effectiveSelection);
    }

    if (!effectiveSelection) {
      return { accepted: false, completed: false, uploadedAttachments };
    }

    const effectiveSelectionKey = getSelectedChatKey(effectiveSelection);
    if (!effectiveSelectionKey || params.pendingChatRequestsRef.current[effectiveSelectionKey]) {
      return { accepted: false, completed: false, uploadedAttachments };
    }

    const userMessage: Message = {
      id: runIdentifiers.userMessageId,
      renderId: createTemporaryId('render'),
      role: 'user',
      content: messageText,
      attachments: displayAttachments,
      timestamp: now,
      previousMessageId,
    };

    let temporaryNextTree =
      effectiveSelection.kind === 'temporary' && effectiveTempChat
        ? applyUserMessageToTree({
            messages: effectiveTempChat.messages,
            branches: effectiveTempChat.branches,
            selectedBranchIds: effectiveTempChat.selectedBranchIds,
            pendingBranch: effectivePendingBranch,
            userMessage,
            newBranchId: runIdentifiers.branchId,
          })
        : null;
    let persistentNextTree =
      effectiveSelection.kind === 'persistent'
        ? applyUserMessageToTree({
            messages: params.persistentMessages,
            branches: params.persistentBranches,
            selectedBranchIds: params.persistentSelectedBranchIds,
            pendingBranch: effectivePendingBranch,
            userMessage,
            newBranchId: runIdentifiers.branchId,
          })
        : null;
    let draftNextTree =
      effectiveSelection.kind === 'draft' && effectiveDraft
        ? applyUserMessageToTree({
            messages: effectiveDraft.messages,
            branches: effectiveDraft.branches,
            selectedBranchIds: effectiveDraft.selectedBranchIds,
            pendingBranch: effectivePendingBranch,
            userMessage,
            newBranchId: runIdentifiers.branchId,
          })
        : null;
    const pendingBranchSelectionId =
      branchSourceMessageId && effectivePendingBranch
        ? temporaryNextTree?.selectedBranchIds[branchSourceMessageId]
          ?? persistentNextTree?.selectedBranchIds[branchSourceMessageId]
          ?? draftNextTree?.selectedBranchIds[branchSourceMessageId]
          ?? null
        : null;
    const optimisticSelection = effectiveSelection;
    const optimisticDraft = effectiveDraft;
    const optimisticTempChat = effectiveTempChat;

    const replaceUserAttachments = (
      messages: Message[],
      attachments: NonNullable<Message['attachments']>
    ) =>
      messages.map((message) =>
        message.id === userMessage.id || message.renderId === userMessage.renderId
          ? { ...message, attachments }
          : message
      );

    const patchTreeAttachments = <T extends { messages: Message[] } | null>(
      tree: T,
      attachments: NonNullable<Message['attachments']>
    ): T => {
      if (!tree) {
        return tree;
      }

      return {
        ...tree,
        messages: replaceUserAttachments(tree.messages, attachments),
      };
    };

    const updatePersistentTranscriptForSelection = (
      selection: SelectedChat,
      updater: (
        transcript: PersistentConversationTranscript
      ) => PersistentConversationTranscript
    ) => {
      if (selection.kind !== 'persistent') {
        return;
      }

      params.updatePersistentConversationTranscript(selection.conversationId, updater);
    };

    const updatePersistentMessagesForSelection = (
      selection: SelectedChat,
      action: SetStateAction<Message[]>
    ) => {
      updatePersistentTranscriptForSelection(selection, (transcript) => ({
        ...transcript,
        messages: resolveStateAction(action, transcript.messages),
      }));
    };

    const patchOptimisticUserAttachments = (
      attachments: NonNullable<Message['attachments']>
    ) => {
      userMessage.attachments = attachments;
      temporaryNextTree = patchTreeAttachments(temporaryNextTree, attachments);
      persistentNextTree = patchTreeAttachments(persistentNextTree, attachments);
      draftNextTree = patchTreeAttachments(draftNextTree, attachments);

      if (optimisticSelection.kind === 'temporary') {
        params.updateTemporaryChat(optimisticSelection.tempChatId, (chat) => ({
          ...chat,
          messages: replaceUserAttachments(chat.messages, attachments),
        }));
      } else if (optimisticSelection.kind === 'persistent') {
        updatePersistentMessagesForSelection(optimisticSelection, (messages) =>
          replaceUserAttachments(messages, attachments)
        );
      } else if (optimisticDraft) {
        params.updateDraftChat(optimisticDraft.id, (draft) => ({
          ...draft,
          messages: replaceUserAttachments(draft.messages, attachments),
        }));
      }
    };

    const restoreBeforeOptimisticUserMessage = () => {
      if (optimisticSelection.kind === 'temporary' && optimisticTempChat) {
        params.updateTemporaryChat(optimisticSelection.tempChatId, () => optimisticTempChat);
      } else if (optimisticSelection.kind === 'persistent') {
        updatePersistentTranscriptForSelection(optimisticSelection, (transcript) => ({
          ...transcript,
          messages: params.persistentMessages,
          branches: params.persistentBranches,
          selectedBranchIds: params.persistentSelectedBranchIds,
        }));
      } else if (optimisticDraft) {
        params.updateDraftChat(optimisticDraft.id, () => optimisticDraft);
      }

      return optimisticSelection;
    };

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
        return { accepted: false, completed: false, uploadedAttachments };
      }
      updatePersistentTranscriptForSelection(effectiveSelection, (transcript) => ({
        ...transcript,
        messages: nextTree.messages,
        branches: nextTree.branches,
        selectedBranchIds: nextTree.selectedBranchIds,
      }));
    } else {
      const draft = effectiveDraft || params.getOrCreateDraft(
        effectiveSelection.mentorId,
        effectiveSelection.workspaceId
      );
      effectiveDraft = draft;
      const nextTree = draftNextTree;
      if (!nextTree) {
        return { accepted: false, completed: false, uploadedAttachments };
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

    if (options.prepareUploadedAttachments) {
      try {
        uploadedAttachments = await options.prepareUploadedAttachments();
        patchOptimisticUserAttachments(mapUploadedAttachments(uploadedAttachments));
      } catch (error) {
        const restoreComposerSelection = restoreBeforeOptimisticUserMessage();
        params.clearPendingChatRequestForSelection(effectiveSelection);
        return {
          accepted: false,
          completed: false,
          error: error instanceof Error ? error.message : 'Failed to upload image.',
          restoreComposerSelection,
          uploadedAttachments,
        };
      }
    }

    let rejectedSendRestoreSelection: SelectedChat | null = null;
    let createConversationForRun = false;
    let provisionalPromotion: ProvisionalChatPromotion | null = null;

    if (effectiveSelection.kind === 'draft' && effectiveDraft) {
      const draftSelection = effectiveSelection;
      const promotedDraftId = effectiveDraft.id;
      const promotedSelection: SelectedChat = {
        kind: 'persistent',
        conversationId: crypto.randomUUID(),
        mentorId: draftSelection.mentorId,
        workspaceId: draftSelection.workspaceId,
      };
      const shouldFocusPromotedDraft = isSameSelectedChat(
        params.selectedChatRef.current,
        draftSelection
      );
      provisionalPromotion = {
        runId: runIdentifiers.runId,
        conversationId: promotedSelection.conversationId,
        prompt: messageText,
        draft: effectiveDraft,
      };
      storeProvisionalChatPromotion(provisionalPromotion);

      params.movePendingChatRequestBetweenSelections(draftSelection, promotedSelection);
      params.moveResponseStyleBetweenSelections(draftSelection, promotedSelection);
      params.clearSearchStateForSelection(draftSelection);
      params.setPersistentConversationTranscript(promotedSelection.conversationId, {
        messages: draftNextTree?.messages ?? effectiveDraft.messages,
        branches: draftNextTree?.branches ?? effectiveDraft.branches,
        selectedBranchIds:
          draftNextTree?.selectedBranchIds ?? effectiveDraft.selectedBranchIds,
        threadsMap: new Map(),
      });

      if (shouldFocusPromotedDraft) {
        params.hydratedRouteConversationIdRef.current = promotedSelection.conversationId;
        params.selectedChatRef.current = promotedSelection;
        params.setSelectedChat(promotedSelection);
        params.replacePersistentConversationUrl(promotedSelection.conversationId);
      }

      params.upsertSidebarConversation({
        id: promotedSelection.conversationId,
        title: fallbackChatTitleFromMessage(messageText || 'Image question'),
        mentorId: promotedSelection.mentorId,
        workspaceId: promotedSelection.workspaceId,
        createdAt: effectiveDraft.createdAt,
        updatedAt: nextUpdatedAt,
      });
      params.setDraftChats((prev) =>
        prev.filter((draft) => draft.id !== promotedDraftId)
      );

      effectiveSelection = promotedSelection;
      effectiveDraft = null;
      rejectedSendRestoreSelection = promotedSelection;
      createConversationForRun = true;
    }

    const streamingMessageId = runIdentifiers.assistantMessageId;
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
      updatePersistentMessagesForSelection(effectiveSelection, (prev) => [
        ...prev,
        streamingMessage,
      ]);
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
        updatePersistentMessagesForSelection(effectiveSelection, (prev) =>
          prev.map((m) =>
            m.id === streamingMessageId ? { ...m, content: m.content + delta } : m
          )
        );
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
        updatePersistentMessagesForSelection(effectiveSelection, (prev) =>
          applyActivity(prev)
        );
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
        updatePersistentMessagesForSelection(effectiveSelection, (prev) =>
          prev.map((m) =>
            m.id === streamingMessageId || m.renderId === streamingMessageId ? finalMessage : m
          )
        );
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
        updatePersistentMessagesForSelection(effectiveSelection, (prev) =>
          prev.filter((m) => m.id !== streamingMessageId)
        );
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
        isError: true,
      };

      if (effectiveSelection.kind === 'temporary') {
        params.updateTemporaryChat(effectiveSelection.tempChatId, (chat) => ({
          ...chat,
          messages: [...chat.messages, errorMessage],
          updatedAt: new Date().toISOString(),
        }));
      } else if (effectiveSelection.kind === 'persistent') {
        updatePersistentMessagesForSelection(effectiveSelection, (prev) => [
          ...prev,
          errorMessage,
        ]);
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

        updatePersistentMessagesForSelection(selection, (messages) =>
          applyMetadata(messages)
        );
      });
    };

    let requestAccepted = false;
    const runMode = effectiveSelection.kind === 'temporary'
      ? 'temporary' as const
      : 'persistent' as const;
    const runTarget = {
      kind: branchSourceMessageId ? 'branch' as const : 'main' as const,
      chatId: effectiveSelection.kind === 'temporary'
        ? effectiveSelection.tempChatId
        : effectiveSelection.kind === 'persistent'
          ? effectiveSelection.conversationId
          : effectiveSelection.draftId,
      conversationId: effectiveSelection.kind === 'persistent'
        ? effectiveSelection.conversationId
        : null,
      threadId: null,
      branchId: runIdentifiers.branchId ?? null,
      branchSourceMessageId,
      sourceMessageId: null,
      expectedPredecessorId: previousMessageId,
    };
    const initialRunSnapshot = createQueuedChatRunSnapshot({
      identifiers: runIdentifiers,
      mode: runMode,
      target: runTarget,
      fallbackTitle: fallbackChatTitleFromMessage(messageText, params.tempChatTitle),
    });
    const requestBody = {
      message: messageText,
      conversationId:
        effectiveSelection.kind === 'persistent'
          ? effectiveSelection.conversationId
          : undefined,
      mentorId:
        effectiveSelection.kind === 'temporary'
          ? undefined
          : effectiveSelection.mentorId ?? undefined,
      workspaceId:
        effectiveSelection.kind === 'temporary'
          ? undefined
          : effectiveSelection.workspaceId ?? undefined,
      modelId: requestModelId,
      ...(requestModelEffort ? { modelEffort: requestModelEffort } : {}),
      ...(requestThinkingEnabled !== null
        ? { thinkingEnabled: requestThinkingEnabled }
        : {}),
      previousMessageId,
      branchSourceMessageId: branchSourceMessageId ?? undefined,
      searchMode: requestSearchMode,
      responseStyle: requestResponseStyle,
      attachments: uploadedAttachments.map((attachment) => ({
        storagePath: attachment.storagePath,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
        width: attachment.width,
        height: attachment.height,
        cleanupOnFailure: true,
      })),
      timezone: getBrowserTimeZone(),
      chatMode: runMode,
      run: {
        ...runIdentifiers,
        temporarySessionId:
          effectiveSelection.kind === 'temporary'
            ? effectiveSelection.tempChatId
            : undefined,
        newBranchId: runIdentifiers.branchId,
        createConversation: createConversationForRun,
        target: runTarget,
      },
      ...(effectiveSelection.kind === 'temporary'
        ? {
            history: toChatHistory(params.activeMessages),
          }
        : {}),
    };

    try {
      let data: ChatResponse;
      if (chatRunCoordinator) {
        requestAccepted = !provisionalPromotion;
        const run = await chatRunCoordinator.start({
          request: requestBody,
          initialSnapshot: initialRunSnapshot,
          onDelta: appendChunk,
          onSearchActivity: updateSearchActivity,
        });
        requestAccepted = Boolean(run.acceptedAt);
        if (run.acceptedAt) {
          removeProvisionalChatPromotion(run.runId);
        }
        if (
          provisionalPromotion
          && isDefinitivePreAcceptanceFailure(run)
        ) {
          return {
            accepted: false,
            completed: false,
            error: run.errorMessage ?? 'The request was not accepted.',
            restoreComposerSelection:
              getDraftSelectionForPromotion(provisionalPromotion),
            uploadedAttachments,
            cleanupUploadedAttachments: uploadedAttachments,
          };
        }
        data = {
          message: run.response ?? undefined,
          conversationId: run.target.conversationId ?? undefined,
          conversationTitle: run.title.value,
          userMessageId: run.userMessageId,
          assistantMessageId: run.assistantMessageId,
          threadId: run.createdThreadId,
          search: run.search ?? undefined,
          searchActivity: run.searchActivity,
          ...(run.status === 'failed' || run.status === 'interrupted'
            ? { error: run.errorMessage ?? 'Chat run failed.' }
            : {}),
          cancelled: run.status === 'cancelled',
        };
      } else {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        });
        if (!response.ok) {
          const failed = (await response.json()) as ChatResponse;
          throw new Error(failed.error || 'Failed to send message.');
        }
        requestAccepted = true;
        data = await readChatStream(response, appendChunk, {
          onSearchActivity: updateSearchActivity,
          onTextEnd: (content) => {
            if (canApplyTemporaryResponseForSelection(effectiveSelection)) {
              finalizeVisibleAssistant(content || latestStreamedContent);
            }
          },
        });
      }
      logResolvedChatModel(data, 'composer');

      if (data.cancelled) {
        removeStreamingMessage();
        return { accepted: true, completed: false, uploadedAttachments };
      }

      const canApplyTemporaryResponse =
        canApplyTemporaryResponseForSelection(effectiveSelection);

      if (data.error) {
        if (!chatRunCoordinator) showErrorMessage(data.error);
        return { accepted: true, completed: false, error: data.error, uploadedAttachments };
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
          workspaceId: data.workspaceId ?? draftSelection.workspaceId,
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
        params.moveResponseStyleBetweenSelections(draftSelection, promotedSelection);
        params.moveSearchModeBetweenSelections(draftSelection, promotedSelection);
        params.clearSearchStateForSelection(draftSelection);

        params.setPersistentConversationTranscript(promotedSelection.conversationId, {
          messages: optimisticMessages,
          branches: draftNextTree?.branches ?? effectiveDraft.branches,
          selectedBranchIds:
            draftNextTree?.selectedBranchIds ?? effectiveDraft.selectedBranchIds,
          threadsMap: new Map(),
        });

        if (shouldFocusPromotedDraft) {
          params.hydratedRouteConversationIdRef.current = promotedSelection.conversationId;
          params.selectedChatRef.current = promotedSelection;
          params.setSelectedChat(promotedSelection);
          params.replacePersistentConversationUrl(promotedSelection.conversationId);
        }

        params.upsertSidebarConversation({
          id: promotedSelection.conversationId,
          title: data.conversationTitle ?? effectiveDraft.title,
          mentorId: promotedSelection.mentorId,
          workspaceId: promotedSelection.workspaceId,
          createdAt: effectiveDraft.createdAt,
          updatedAt: nextUpdatedAt,
        });
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
          return { accepted: true, completed: true, uploadedAttachments };
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
              const loadedConversation = await params.loadConversationMessages(
                persistentSelection.conversationId
              );

              params.updatePersistentConversationTranscript(
                persistentSelection.conversationId,
                (transcript) => {
                  const mergedSelections = mergeReloadedBranchSelections({
                    loadedSelectedBranchIds: loadedConversation.selectedBranchIds,
                    latestSelectedBranchIds: transcript.selectedBranchIds,
                    loadedBranches: loadedConversation.branches,
                    branchSourceMessageId,
                    pendingBranchSelectionId,
                  });

                  return {
                    ...transcript,
                    messages: mergeReloadedMessagesForRender({
                      loadedMessages: loadedConversation.messages,
                      currentMessages: transcript.messages,
                    }),
                    branches: loadedConversation.branches,
                    selectedBranchIds: mergedSelections,
                    threadsMap: mergeThreadsMaps(
                      loadedConversation.threadsMap,
                      transcript.threadsMap
                    ),
                  };
                }
              );
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

      return { accepted: true, completed: true, uploadedAttachments };
    } catch (error) {
      const coordinatedRun = chatRunCoordinator
        ? chatRunCoordinator.getSnapshot(runIdentifiers.runId)
        : null;
      const definitiveSubmissionError =
        error instanceof Error
        && (
          error.name === 'ChatRunConflictError'
          || error.name === 'ChatRunSubmissionError'
        );
      if (coordinatedRun?.acceptedAt) {
        requestAccepted = true;
        removeProvisionalChatPromotion(coordinatedRun.runId);
      }
      if (
        provisionalPromotion
        && (
          (coordinatedRun && isDefinitivePreAcceptanceFailure(coordinatedRun))
          || (!coordinatedRun && definitiveSubmissionError)
        )
      ) {
        return {
          accepted: false,
          completed: false,
          error:
            coordinatedRun?.errorMessage
            ?? (error instanceof Error ? error.message : 'The request was not accepted.'),
          restoreComposerSelection:
            getDraftSelectionForPromotion(provisionalPromotion),
          uploadedAttachments,
          cleanupUploadedAttachments: uploadedAttachments,
        };
      }
      if (!requestAccepted && (uploadedAttachments.length > 0 || displayAttachments.length > 0)) {
        removeStreamingMessage();
        const restoreComposerSelection =
          rejectedSendRestoreSelection ?? restoreBeforeOptimisticUserMessage();
        return {
          accepted: false,
          completed: false,
          error: 'Sorry, there was an error processing your message.',
          restoreComposerSelection,
          uploadedAttachments,
          cleanupUploadedAttachments: uploadedAttachments,
        };
      }

      const canApplyTemporaryResponse =
        canApplyTemporaryResponseForSelection(effectiveSelection);

      if (chatRunCoordinator) {
        return {
          accepted: true,
          completed: false,
          error: error instanceof Error ? error.message : 'The chat run failed.',
          uploadedAttachments,
        };
      }

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
          isError: true,
        });
      }
      return { accepted: true, completed: false, uploadedAttachments };
    } finally {
      params.clearPendingChatRequestForSelection(effectiveSelection);
    }
  }, [chatRunCoordinator]);
}

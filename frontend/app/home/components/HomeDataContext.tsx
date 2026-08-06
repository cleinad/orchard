'use client';

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
  type SetStateAction,
} from 'react';
import { flushSync } from 'react-dom';
import { usePathname, useRouter } from 'next/navigation';
import { useHomeData } from '@/app/home/components/useHomeData';
import { createTemporaryId } from '@/lib/chat-session';
import type {
  ConversationListItem,
  SidebarMentorGroup,
  SidebarWorkspaceGroup,
} from '@/app/home/types';
import type { MentorListItem } from '@/lib/mentors/types';
import type { WorkspaceSummary } from '@/lib/workspaces';
import type { ChatModelListItem } from '@/lib/chat-models';
import type { HomeNavigationData } from '@/app/home/components/homeSidebarData';
import type { ConversationBranch, BranchSelectionMap, Message } from '@/app/home/types';
import {
  createEmptyPersistentConversationTranscript,
  normalizePersistentConversationTranscript,
  type PersistentConversationTranscript,
  type PersistentConversationTranscriptInput,
  type PersistentConversationTranscriptRecord,
} from '@/app/home/components/persistentConversationCache';
import type {
  ThreadMessage,
  ThreadMeta,
  ThreadSessionStatus,
} from '@/app/home/components/threadTypes';
import {
  fromStoredMessage,
  fromStoredThreadMessage,
  toStoredMessage,
  toStoredThreadMessage,
  type StoredMessage,
  type StoredThreadMessage,
} from '@/app/home/components/homeStorage';
import { useOptionalChatRunCoordinator } from '@/app/components/ChatRunCoordinator';
import {
  isSettledChatRunSnapshot,
} from '@/lib/chat-runs/protocol';
import { mergeThreadsMaps } from '@/app/home/components/persistentThreadRuntime';
import {
  getDraftSelectionForPromotion,
  loadProvisionalChatPromotion,
  removeProvisionalChatPromotion,
} from '@/app/home/components/provisionalChatPromotion';
import {
  recordHomePerformanceEvent,
  setHomePerformanceGauge,
} from '@/app/home/components/homePerformanceInstrumentation';
// ---------------------------------------------------------------------------
// Shared home selection types (also used by page.tsx for send / tree state)
// ---------------------------------------------------------------------------

export type SelectedChat =
  | {
      kind: 'persistent';
      conversationId: string;
      mentorId: string | null;
      workspaceId: string | null;
    }
  | { kind: 'draft'; draftId: string; mentorId: string | null; workspaceId: string | null }
  | { kind: 'temporary'; tempChatId: string };

type ThreadMetaRecord = Record<string, ThreadMeta[]>;
type ThreadMessagesRecord = Record<string, ThreadMessage[]>;
type ThreadStatusRecord = Record<string, ThreadSessionStatus>;

export interface PersistentDraftChat {
  id: string;
  mentorId: string | null;
  workspaceId: string | null;
  title: 'New chat';
  createdAt: string;
  updatedAt: string;
  messages: Message[];
  branches: ConversationBranch[];
  selectedBranchIds: BranchSelectionMap;
}

export interface TemporaryChatSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: Message[];
  branches: ConversationBranch[];
  selectedBranchIds: BranchSelectionMap;
  threadsMap: ThreadMetaRecord;
  threadMessages: ThreadMessagesRecord;
  threadStatuses: ThreadStatusRecord;
}

const TEMP_CHAT_TITLE = 'Temporary chat';
const TEMP_CHAT_STORAGE_KEY = 'keen-home-temp-chats-v1';
const HOME_SELECTION_HANDOFF_STORAGE_KEY = 'keen-home-selection-handoff-v1';
const EMPTY_CHAT_MODELS: ChatModelListItem[] = [];

// ---------------------------------------------------------------------------
// Temporary chat sessionStorage serialization
// ---------------------------------------------------------------------------

interface StoredTemporaryChatSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: StoredMessage[];
  branches: ConversationBranch[];
  selectedBranchIds: BranchSelectionMap;
  threadsMap: ThreadMetaRecord;
  threadMessages: Record<string, StoredThreadMessage[]>;
  threadStatuses: ThreadStatusRecord;
}

type HomeSelectionHandoff =
  | { kind: 'draft'; draft: PersistentDraftChat }
  | { kind: 'temporary'; tempChatId: string };

type StoredHomeSelectionHandoff =
  | { kind: 'draft'; draft: Omit<PersistentDraftChat, 'messages'> & { messages: StoredMessage[] } }
  | { kind: 'temporary'; tempChatId: string };

function persistHomeSelectionHandoff(handoff: HomeSelectionHandoff) {
  const stored: StoredHomeSelectionHandoff =
    handoff.kind === 'draft'
      ? {
          kind: 'draft',
          draft: {
            ...handoff.draft,
            messages: handoff.draft.messages.map(toStoredMessage),
          },
        }
      : handoff;

  window.sessionStorage.setItem(HOME_SELECTION_HANDOFF_STORAGE_KEY, JSON.stringify(stored));
}

function readHomeSelectionHandoff(): HomeSelectionHandoff | null {
  const stored = window.sessionStorage.getItem(HOME_SELECTION_HANDOFF_STORAGE_KEY);
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored) as StoredHomeSelectionHandoff;

    if (parsed.kind === 'temporary') {
      return parsed;
    }

    return {
      kind: 'draft',
      draft: {
        ...parsed.draft,
        workspaceId: parsed.draft.workspaceId ?? null,
        messages: parsed.draft.messages.map(fromStoredMessage),
      },
    };
  } catch {
    window.sessionStorage.removeItem(HOME_SELECTION_HANDOFF_STORAGE_KEY);
    return null;
  }
}

function clearHomeSelectionHandoff() {
  window.sessionStorage.removeItem(HOME_SELECTION_HANDOFF_STORAGE_KEY);
}

function resolveStateAction<T>(action: SetStateAction<T>, current: T): T {
  return typeof action === 'function'
    ? (action as (previous: T) => T)(current)
    : action;
}

function sortByUpdatedAtDesc<T extends { updatedAt: string }>(items: T[]): T[] {
  return [...items].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

function mergeHydratedTranscriptWithLocalRunState(
  hydrated: PersistentConversationTranscript,
  local: PersistentConversationTranscript | null
): PersistentConversationTranscript {
  if (!local) return hydrated;
  const hydratedMessageIds = new Set(hydrated.messages.map((message) => message.id));
  const localOnlyMessages = local.messages.filter(
    (message) => !hydratedMessageIds.has(message.id)
  );

  return {
    ...hydrated,
    messages: [...hydrated.messages, ...localOnlyMessages].sort((a, b) => {
      const timestampOrder = a.timestamp.getTime() - b.timestamp.getTime();
      return timestampOrder || a.id.localeCompare(b.id);
    }),
    threadsMap: mergeThreadsMaps(hydrated.threadsMap, local.threadsMap),
  };
}

export function deserializeTemporaryChats(raw: string): TemporaryChatSession[] {
  const stored = JSON.parse(raw) as StoredTemporaryChatSession[];
  return stored.map((chat) => ({
    id: chat.id,
    title: chat.title,
    createdAt: chat.createdAt,
    updatedAt: chat.updatedAt,
    messages: chat.messages.map(fromStoredMessage),
    branches: chat.branches,
    selectedBranchIds: chat.selectedBranchIds,
    threadsMap: chat.threadsMap,
    threadMessages: Object.fromEntries(
      Object.entries(chat.threadMessages).map(([threadId, msgs]) => [
        threadId,
        msgs.map(fromStoredThreadMessage),
      ])
    ),
    threadStatuses: chat.threadStatuses,
  }));
}

export function serializeTemporaryChats(chats: TemporaryChatSession[]): string {
  const stored: StoredTemporaryChatSession[] = chats.map((chat) => ({
    id: chat.id,
    title: chat.title,
    createdAt: chat.createdAt,
    updatedAt: chat.updatedAt,
    messages: chat.messages.map(toStoredMessage),
    branches: chat.branches,
    selectedBranchIds: chat.selectedBranchIds,
    threadsMap: chat.threadsMap,
    threadMessages: Object.fromEntries(
      Object.entries(chat.threadMessages).map(([threadId, msgs]) => [
        threadId,
        msgs.map(toStoredThreadMessage),
      ])
    ),
    threadStatuses: chat.threadStatuses,
  }));
  return JSON.stringify(stored);
}

// ---------------------------------------------------------------------------
// Context value shape
// ---------------------------------------------------------------------------

interface HomeDataContextValue {
  // Sidebar data
  mentors: MentorListItem[];
  workspaces: WorkspaceSummary[];
  conversations: ConversationListItem[];
  chatModels: ChatModelListItem[];
  workspaceGroups: SidebarWorkspaceGroup[];
  mentorGroups: SidebarMentorGroup[];
  loadingLists: boolean;
  listError: string | null;
  setListError: (err: string | null) => void;
  refreshSidebarData: () => Promise<void>;
  upsertSidebarConversation: (conversation: {
    id: string;
    title?: string | null;
    mentorId?: string | null;
    workspaceId?: string | null;
    updatedAt?: string | null;
    createdAt?: string | null;
  }) => void;
  upsertWorkspaceSummary: (workspace: WorkspaceSummary) => void;
  removeWorkspaceSummary: (workspaceId: string) => void;
  rollbackProvisionalChatPromotion: (runId: string) => Extract<
    SelectedChat,
    { kind: 'draft' }
  > | null;

  // Draft + temporary chat state
  draftChats: PersistentDraftChat[];
  setDraftChats: React.Dispatch<React.SetStateAction<PersistentDraftChat[]>>;
  temporaryChats: TemporaryChatSession[];
  setTemporaryChats: React.Dispatch<React.SetStateAction<TemporaryChatSession[]>>;
  updateDraftChat: (id: string, updater: (d: PersistentDraftChat) => PersistentDraftChat) => void;
  updateTemporaryChat: (id: string, updater: (c: TemporaryChatSession) => TemporaryChatSession) => void;
  getOrCreateDraft: (mentorId: string | null, workspaceId?: string | null) => PersistentDraftChat;

  // Selection
  selectedChat: SelectedChat | null;
  setSelectedChat: React.Dispatch<React.SetStateAction<SelectedChat | null>>;
  selectedChatRef: React.MutableRefObject<SelectedChat | null>;
  persistentConversationCache: PersistentConversationTranscriptRecord;
  clearPersistentConversationCache: () => void;
  getPersistentConversationTranscript: (
    conversationId: string
  ) => PersistentConversationTranscript | null;
  setPersistentConversationTranscript: (
    conversationId: string,
    transcript: PersistentConversationTranscriptInput
  ) => void;
  loadPersistentConversationTranscript: (
    conversationId: string,
    loader: () => Promise<PersistentConversationTranscriptInput>
  ) => Promise<PersistentConversationTranscript>;
  updatePersistentConversationTranscript: (
    conversationId: string,
    updater: (
      transcript: PersistentConversationTranscript
    ) => PersistentConversationTranscript
  ) => void;
  getTranscriptScrollPosition: (key: string) => number | null;
  setTranscriptScrollPosition: (key: string, scrollTop: number) => void;

  // Selection actions (called from SidePanel in layout, need page side-effects too)
  handleSelectConversation: (conversation: ConversationListItem) => void;
  handleSelectDraft: (draftId: string) => void;
  handleSelectTemporaryChat: (tempChatId: string) => void;
  handleCreateDraftSelection: (mentorId: string | null, workspaceId?: string | null) => void;
  handleCreateTemporaryChat: () => void;
  handleCloseTemporaryChat: (tempChatId: string) => void;

  // Data loading helpers the page uses directly
  loadConversationById: (id: string) => Promise<ConversationListItem>;
  loadConversationMessages: (id: string) => Promise<{
    messages: import('@/app/home/types').Message[];
    branches: import('@/app/home/types').ConversationBranch[];
    selectedBranchIds: import('@/app/home/types').BranchSelectionMap;
    threadsMap: Map<string, import('@/app/home/components/threadTypes').ThreadMeta[]>;
  }>;

  // Page registers its chat-switch side effects here (thread reset, timers, etc.)
  registerPrepareForChatSwitch: (fn: (next: SelectedChat | null) => void) => void;
  /** Stable indirection so async route code does not hold a stale `prepareForChatSwitch` closure */
  invokePrepareForChatSwitch: (next: SelectedChat | null) => void;
  // Page registers cleanup for closed temp chats (composer/search/pending state)
  registerCloseTempChatCleanup: (fn: (tempChatId: string) => void) => void;

  // Route helpers the page needs
  openPersistentConversation: (id: string, opts?: { replace?: boolean }) => void;
  replacePersistentConversationUrl: (id: string) => void;
  openHomeWorkspace: () => void;
  openWorkspace: (
    workspaceId: string,
    options?: { navigate?: boolean }
  ) => void;
  buildHomeHref: (pathname: string) => string;
  routeConversationId: string | null;
  pendingRouteConversationId: string | null;
  clearPendingRouteConversationId: () => void;
  e2eQueryParam: string | null;
}

const HomeDataContext = createContext<HomeDataContextValue | null>(null);

export function useHomeDataContext(): HomeDataContextValue {
  const ctx = useContext(HomeDataContext);
  if (!ctx) throw new Error('useHomeDataContext must be used within HomeDataProvider');
  return ctx;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface Props {
  children: ReactNode;
  routeConversationId: string | null;
  e2eQueryParam: string | null;
  /** When true, skip the automatic mentors/conversations fetch (home e2e fixtures supply their own data) */
  skipInitialSidebarRefresh?: boolean;
  initialNavigationData?: HomeNavigationData | null;
  initialChatModels?: ChatModelListItem[];
}

export function HomeDataProvider({
  children,
  routeConversationId,
  e2eQueryParam,
  skipInitialSidebarRefresh = false,
  initialNavigationData = null,
  initialChatModels = EMPTY_CHAT_MODELS,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const chatRunCoordinator = useOptionalChatRunCoordinator();

  const {
    mentors,
    workspaces,
    conversations,
    workspaceGroups,
    mentorGroups,
    loadingLists,
    listError,
    setListError,
    refreshSidebarData,
    upsertSidebarConversation,
    removeSidebarConversation,
    upsertWorkspaceSummary,
    removeWorkspaceSummary,
    loadConversationById,
    loadConversationMessages,
  } = useHomeData(initialNavigationData);

  const [draftChats, setDraftChats] = useState<PersistentDraftChat[]>([]);
  const [temporaryChats, setTemporaryChats] = useState<TemporaryChatSession[]>([]);
  const [selectedChat, setSelectedChat] = useState<SelectedChat | null>(null);
  const [clientRouteConversationId, setClientRouteConversationId] =
    useState<string | null>(routeConversationId);
  const [pendingRouteConversationId, setPendingRouteConversationId] =
    useState<string | null>(null);
  const [persistentConversationCache, setPersistentConversationCacheState] =
    useState<PersistentConversationTranscriptRecord>({});

  const selectedChatRef = useRef<SelectedChat | null>(null);
  const appliedPersistentRunTitlesRef = useRef(new Set<string>());
  const pendingPersistentRunTitleRefreshesRef = useRef(new Set<string>());
  const persistentConversationCacheRef = useRef<PersistentConversationTranscriptRecord>({});
  const persistentConversationLoadsRef =
    useRef<Record<string, Promise<PersistentConversationTranscript>>>({});
  const transcriptScrollPositionsRef = useRef<Record<string, number>>({});
  // Keep ref aligned with state for async handlers (same pattern as page used before lift)
  selectedChatRef.current = selectedChat;

  const setPersistentConversationCache = useCallback(
    (updater: SetStateAction<PersistentConversationTranscriptRecord>) => {
      const next = resolveStateAction(updater, persistentConversationCacheRef.current);
      persistentConversationCacheRef.current = next;
      setHomePerformanceGauge(
        'persistent-conversation-cache-size',
        Object.keys(next).length
      );
      setPersistentConversationCacheState(next);
    },
    []
  );

  const getPersistentConversationTranscript = useCallback(
    (conversationId: string) =>
      persistentConversationCacheRef.current[conversationId] ?? null,
    []
  );

  const setPersistentConversationTranscript = useCallback(
    (
      conversationId: string,
      transcript: PersistentConversationTranscriptInput
    ) => {
      setPersistentConversationCache((current) => ({
        ...current,
        [conversationId]: normalizePersistentConversationTranscript(transcript),
      }));
    },
    [setPersistentConversationCache]
  );

  const loadPersistentConversationTranscript = useCallback(
    (
      conversationId: string,
      loader: () => Promise<PersistentConversationTranscriptInput>
    ) => {
      const cached = persistentConversationCacheRef.current[conversationId];
      if (cached) {
        return Promise.resolve(cached);
      }

      const existingLoad = persistentConversationLoadsRef.current[conversationId];
      if (existingLoad) {
        return existingLoad;
      }

      const load = loader()
        .then((transcriptInput) => {
          const hydrated = normalizePersistentConversationTranscript(transcriptInput);
          const transcript = mergeHydratedTranscriptWithLocalRunState(
            hydrated,
            persistentConversationCacheRef.current[conversationId] ?? null
          );
          setPersistentConversationCache((current) => ({
            ...current,
            [conversationId]: transcript,
          }));
          return transcript;
        })
        .finally(() => {
          if (persistentConversationLoadsRef.current[conversationId] === load) {
            const nextLoads = { ...persistentConversationLoadsRef.current };
            delete nextLoads[conversationId];
            persistentConversationLoadsRef.current = nextLoads;
          }
        });

      persistentConversationLoadsRef.current = {
        ...persistentConversationLoadsRef.current,
        [conversationId]: load,
      };

      return load;
    },
    [setPersistentConversationCache]
  );

  const updatePersistentConversationTranscript = useCallback(
    (
      conversationId: string,
      updater: (
        transcript: PersistentConversationTranscript
      ) => PersistentConversationTranscript
    ) => {
      setPersistentConversationCache((current) => {
        const existing =
          current[conversationId] ?? createEmptyPersistentConversationTranscript();
        const nextTranscript = updater(existing);
        if (nextTranscript === existing) {
          return current;
        }

        return {
          ...current,
          [conversationId]: nextTranscript,
        };
      });
    },
    [setPersistentConversationCache]
  );

  const clearPersistentConversationCache = useCallback(() => {
    persistentConversationLoadsRef.current = {};
    setPersistentConversationCache({});
  }, [setPersistentConversationCache]);

  const removePersistentConversationTranscript = useCallback(
    (conversationId: string) => {
      const nextLoads = { ...persistentConversationLoadsRef.current };
      delete nextLoads[conversationId];
      persistentConversationLoadsRef.current = nextLoads;
      setPersistentConversationCache((current) => {
        if (!current[conversationId]) return current;
        const next = { ...current };
        delete next[conversationId];
        return next;
      });
    },
    [setPersistentConversationCache]
  );

  const getTranscriptScrollPosition = useCallback((key: string) => {
    return transcriptScrollPositionsRef.current[key] ?? null;
  }, []);

  const setTranscriptScrollPosition = useCallback((key: string, scrollTop: number) => {
    transcriptScrollPositionsRef.current = {
      ...transcriptScrollPositionsRef.current,
      [key]: scrollTop,
    };
  }, []);

  useEffect(() => {
    setClientRouteConversationId(routeConversationId);
  }, [routeConversationId]);

  // Page registers its chat-switch side-effect callback here.
  const prepareForChatSwitchRef = useRef<(next: SelectedChat | null) => void>(() => {});
  const registerPrepareForChatSwitch = useCallback(
    (fn: (next: SelectedChat | null) => void) => {
      prepareForChatSwitchRef.current = fn;
    },
    []
  );

  const invokePrepareForChatSwitch = useCallback((next: SelectedChat | null) => {
    prepareForChatSwitchRef.current(next);
  }, []);

  // Page registers cleanup for closed temp chats (composer/search/pending state)
  const closeTempChatCleanupRef = useRef<(tempChatId: string) => void>(() => {});
  const registerCloseTempChatCleanup = useCallback(
    (fn: (tempChatId: string) => void) => {
      closeTempChatCleanupRef.current = fn;
    },
    []
  );

  // ------------------------------------------------------------------
  // Restore temporary chats from sessionStorage on mount
  // ------------------------------------------------------------------

  useEffect(() => {
    const stored = window.sessionStorage.getItem(TEMP_CHAT_STORAGE_KEY);
    if (!stored) return;
    try {
      setTemporaryChats(sortByUpdatedAtDesc(deserializeTemporaryChats(stored)));
    } catch {
      window.sessionStorage.removeItem(TEMP_CHAT_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (temporaryChats.length === 0) {
      window.sessionStorage.removeItem(TEMP_CHAT_STORAGE_KEY);
      recordHomePerformanceEvent('temporary-chat-storage-write');
      return;
    }
    window.sessionStorage.setItem(TEMP_CHAT_STORAGE_KEY, serializeTemporaryChats(temporaryChats));
    recordHomePerformanceEvent('temporary-chat-storage-write');
  }, [temporaryChats]);

  useEffect(() => {
    if (!chatRunCoordinator) return;
    return chatRunCoordinator.subscribeAll((run) => {
      if (run.mode === 'persistent') {
        const conversationId = run.target.conversationId;
        const currentSelection = selectedChatRef.current;
        const matchingDraft =
          currentSelection?.kind === 'draft'
          && currentSelection.draftId === run.target.chatId;
        if (
          conversationId
          && run.acceptedAt
          && run.target.kind === 'main'
          && (!currentSelection || matchingDraft)
        ) {
          const existingConversation = conversations.find(
            (conversation) => conversation.id === conversationId
          );
          const next: SelectedChat = {
            kind: 'persistent',
            conversationId,
            mentorId: matchingDraft
              ? currentSelection.mentorId
              : existingConversation?.mentor_id ?? null,
            workspaceId: matchingDraft
              ? currentSelection.workspaceId
              : existingConversation?.workspace_id ?? null,
          };
          if (matchingDraft) {
            setDraftChats((current) =>
              current.filter((draft) => draft.id !== currentSelection.draftId)
            );
          }
          selectedChatRef.current = next;
          setSelectedChat(next);
          setClientRouteConversationId(conversationId);
          setPendingRouteConversationId(null);
          const nextUrl = new URL(window.location.href);
          nextUrl.pathname = `/home/${encodeURIComponent(conversationId)}`;
          window.history.replaceState(
            window.history.state,
            '',
            `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`
          );
        }
        if (
          run.target.kind !== 'thread'
          && conversationId
          && run.title.value
          && run.title.source === 'generated'
          && run.subsystems.title === 'completed'
        ) {
          const titleKey = `${conversationId}:${run.title.source}:${run.title.version}:${run.title.value}`;
          if (!appliedPersistentRunTitlesRef.current.has(titleKey)) {
            const existing = conversations.find((conversation) =>
              conversation.id === conversationId
            );
            if (existing) {
              appliedPersistentRunTitlesRef.current.add(titleKey);
              pendingPersistentRunTitleRefreshesRef.current.delete(titleKey);
              upsertSidebarConversation({
                id: existing.id,
                title: run.title.value,
                mentorId: existing.mentor_id,
                workspaceId: existing.workspace_id,
                createdAt: existing.created_at,
                updatedAt: existing.updated_at,
              });
            } else if (!pendingPersistentRunTitleRefreshesRef.current.has(titleKey)) {
              pendingPersistentRunTitleRefreshesRef.current.add(titleKey);
              void refreshSidebarData().finally(() => {
                pendingPersistentRunTitleRefreshesRef.current.delete(titleKey);
              });
            }
          }
        }
        return;
      }
      if (run.mode !== 'temporary') return;
      const now = run.updatedAt;
      const assistantMessage: Message = {
        id: run.assistantMessageId,
        renderId: run.assistantMessageId,
        role: 'assistant',
        content: run.response
          ?? (run.status === 'failed' || run.status === 'interrupted'
            ? run.errorMessage ?? 'The temporary response was interrupted.'
            : ''),
        timestamp: new Date(run.updatedAt),
        previousMessageId: run.userMessageId,
        isStreaming: !isSettledChatRunSnapshot(run),
        isError: run.status === 'failed' || run.status === 'interrupted',
        searchMetadata: run.search?.metadata ?? null,
        searchActivity: run.searchActivity,
      };
      const threadId = run.createdThreadId ?? run.target.threadId;
      const isThread = run.target.kind === 'thread' && Boolean(threadId);

      setTemporaryChats((current) => {
        const existing = current.find((chat) => chat.id === run.target.chatId);
        if (existing) {
          return current.map((chat) => {
            if (chat.id !== run.target.chatId) return chat;
            if (isThread && threadId) {
              const priorThreadMessages = chat.threadMessages[threadId] ?? [];
              const existingAssistant = priorThreadMessages.find(
                (message) => message.id === run.assistantMessageId
              );
              const nextThreadMessages = [
                ...priorThreadMessages.filter((message) => message.id !== run.assistantMessageId),
                ...(run.status === 'cancelled'
                  ? []
                  : [{
                      ...assistantMessage,
                      content: assistantMessage.content || existingAssistant?.content || '',
                    }]),
              ];
              return {
                ...chat,
                updatedAt: now,
                threadMessages: {
                  ...chat.threadMessages,
                  [threadId]: nextThreadMessages,
                },
                threadStatuses: {
                  ...chat.threadStatuses,
                  [threadId]: run.status === 'failed' || run.status === 'interrupted'
                    ? 'error' as const
                    : isSettledChatRunSnapshot(run)
                      ? 'ready' as const
                      : 'loading' as const,
                },
              };
            }
            return {
              ...chat,
              title: run.title.value ?? chat.title,
              updatedAt: now,
              messages: [
                ...chat.messages.filter((message) => message.id !== run.assistantMessageId),
                ...(run.status === 'cancelled'
                  ? []
                  : [{
                      ...assistantMessage,
                      content: assistantMessage.content
                        || chat.messages.find((message) => message.id === run.assistantMessageId)?.content
                        || '',
                    }]),
              ],
            };
          });
        }
        return current;
      });
    });
  }, [
    chatRunCoordinator,
    conversations,
    refreshSidebarData,
    upsertSidebarConversation,
    upsertWorkspaceSummary,
    removeWorkspaceSummary,
  ]);

  // ------------------------------------------------------------------
  // Restore selection handoff (draft/temp chat navigated from /home/<id>)
  // ------------------------------------------------------------------

  useEffect(() => {
    if (routeConversationId || selectedChat) return;

    const handoff = readHomeSelectionHandoff();
    if (!handoff) return;

    if (handoff.kind === 'temporary') {
      const match = temporaryChats.find((c) => c.id === handoff.tempChatId);
      if (!match) return;
      const next: SelectedChat = { kind: 'temporary', tempChatId: handoff.tempChatId };
      selectedChatRef.current = next;
      setSelectedChat(next);
      clearHomeSelectionHandoff();
      return;
    }

    const next: SelectedChat = {
      kind: 'draft',
      draftId: handoff.draft.id,
      mentorId: handoff.draft.mentorId,
      workspaceId: handoff.draft.workspaceId ?? null,
    };
    setDraftChats((prev) =>
      prev.some((d) => d.id === handoff.draft.id) ? prev : [handoff.draft, ...prev]
    );
    selectedChatRef.current = next;
    setSelectedChat(next);
    clearHomeSelectionHandoff();
  }, [routeConversationId, selectedChat, temporaryChats]);

  // ------------------------------------------------------------------
  // Mutations
  // ------------------------------------------------------------------

  const updateDraftChat = useCallback(
    (id: string, updater: (d: PersistentDraftChat) => PersistentDraftChat) => {
      setDraftChats((prev) => prev.map((d) => (d.id === id ? updater(d) : d)));
    },
    []
  );

  const updateTemporaryChat = useCallback(
    (id: string, updater: (c: TemporaryChatSession) => TemporaryChatSession) => {
      setTemporaryChats((prev) =>
        sortByUpdatedAtDesc(prev.map((c) => (c.id === id ? updater(c) : c)))
      );
    },
    []
  );

  const createDraft = useCallback((
    mentorId: string | null,
    workspaceId: string | null = null
  ): PersistentDraftChat => {
    const now = new Date().toISOString();
    return {
      id: createTemporaryId('draft'),
      mentorId,
      workspaceId,
      title: 'New chat',
      createdAt: now,
      updatedAt: now,
      messages: [],
      branches: [],
      selectedBranchIds: {},
    };
  }, []);

  const getOrCreateDraft = useCallback(
    (mentorId: string | null, workspaceId: string | null = null) => {
      const existing = draftChats.find(
        (d) => d.mentorId === mentorId && d.workspaceId === workspaceId
      );
      if (existing) return existing;
      const draft = createDraft(mentorId, workspaceId);
      setDraftChats((prev) => [draft, ...prev]);
      return draft;
    },
    [createDraft, draftChats]
  );

  // ------------------------------------------------------------------
  // Route helpers
  // ------------------------------------------------------------------

  const buildHomeHref = useCallback(
    (pathname: string) => {
      if (!e2eQueryParam) return pathname;
      const sep = pathname.includes('?') ? '&' : '?';
      return `${pathname}${sep}e2e=${encodeURIComponent(e2eQueryParam)}`;
    },
    [e2eQueryParam]
  );

  const openHomeWorkspace = useCallback(() => {
    if (!clientRouteConversationId && pathname === '/home') {
      return;
    }

    setClientRouteConversationId(null);
    setPendingRouteConversationId(null);
    router.push(buildHomeHref('/home'), { scroll: false });
  }, [buildHomeHref, clientRouteConversationId, pathname, router]);

  const openWorkspace = useCallback(
    (workspaceId: string, options?: { navigate?: boolean }) => {
      const href = buildHomeHref(`/workspaces/${encodeURIComponent(workspaceId)}`);
      setClientRouteConversationId(null);
      setPendingRouteConversationId(null);
      if (options?.navigate === false) {
        return;
      }
      router.push(href, { scroll: false });
    },
    [buildHomeHref, router]
  );

  const openPersistentConversation = useCallback(
    (conversationId: string, options?: { replace?: boolean }) => {
      const href = buildHomeHref(`/home/${encodeURIComponent(conversationId)}`);
      setPendingRouteConversationId(conversationId);
      if (options?.replace) {
        router.replace(href, { scroll: false });
      } else {
        router.push(href, { scroll: false });
      }
    },
    [buildHomeHref, router]
  );

  const replacePersistentConversationUrl = useCallback(
    (conversationId: string) => {
      const href = buildHomeHref(`/home/${encodeURIComponent(conversationId)}`);
      setClientRouteConversationId(conversationId);
      setPendingRouteConversationId(null);
      window.history.replaceState(window.history.state, '', href);
    },
    [buildHomeHref]
  );

  const rollbackProvisionalChatPromotion = useCallback((runId: string) => {
    const promotion = loadProvisionalChatPromotion(runId);
    if (!promotion) return null;

    removeProvisionalChatPromotion(runId);
    removeSidebarConversation(promotion.conversationId);
    removePersistentConversationTranscript(promotion.conversationId);
    setDraftChats((current) => [
      promotion.draft,
      ...current.filter((draft) => draft.id !== promotion.draft.id),
    ]);

    const draftSelection = getDraftSelectionForPromotion(promotion);
    const currentSelection = selectedChatRef.current;
    const isSelectedPromotion =
      currentSelection?.kind === 'persistent'
      && currentSelection.conversationId === promotion.conversationId;
    const isViewingPromotion =
      window.location.pathname
        === `/home/${encodeURIComponent(promotion.conversationId)}`;
    if (isViewingPromotion) {
      if (isSelectedPromotion) {
        prepareForChatSwitchRef.current(draftSelection);
      }
      selectedChatRef.current = draftSelection;
      setSelectedChat(draftSelection);
      openHomeWorkspace();
    }

    return draftSelection;
  }, [
    openHomeWorkspace,
    removePersistentConversationTranscript,
    removeSidebarConversation,
  ]);

  const clearPendingRouteConversationId = useCallback(() => {
    setPendingRouteConversationId(null);
  }, []);

  // ------------------------------------------------------------------
  // Selection actions
  // ------------------------------------------------------------------

  const handleSelectConversation = useCallback(
    (conversation: ConversationListItem) => {
      const currentSelection = selectedChatRef.current;
      const next: SelectedChat = {
        kind: 'persistent',
        conversationId: conversation.id,
        mentorId: conversation.mentor_id,
        workspaceId: conversation.workspace_id,
      };

      if (
        currentSelection?.kind !== 'persistent' ||
        currentSelection.conversationId !== conversation.id ||
        currentSelection.mentorId !== next.mentorId ||
        currentSelection.workspaceId !== next.workspaceId
      ) {
        flushSync(() => {
          invokePrepareForChatSwitch(next);
          selectedChatRef.current = next;
          setSelectedChat(next);
        });
      }

      openPersistentConversation(conversation.id);
    },
    [invokePrepareForChatSwitch, openPersistentConversation, selectedChatRef]
  );

  const handleSelectDraft = useCallback(
    (draftId: string) => {
      const draft = draftChats.find((d) => d.id === draftId);
      if (!draft) return;
      const next: SelectedChat = {
        kind: 'draft',
        draftId,
        mentorId: draft.mentorId,
        workspaceId: draft.workspaceId,
      };
      prepareForChatSwitchRef.current(next);
      if (clientRouteConversationId || pathname !== '/home') {
        persistHomeSelectionHandoff({ kind: 'draft', draft });
      }
      selectedChatRef.current = next;
      setSelectedChat(next);
      openHomeWorkspace();
    },
    [clientRouteConversationId, draftChats, openHomeWorkspace, pathname]
  );

  const handleSelectTemporaryChat = useCallback(
    (tempChatId: string) => {
      const next: SelectedChat = { kind: 'temporary', tempChatId };
      prepareForChatSwitchRef.current(next);
      if (clientRouteConversationId || pathname !== '/home') {
        persistHomeSelectionHandoff({ kind: 'temporary', tempChatId });
      }
      selectedChatRef.current = next;
      setSelectedChat(next);
      openHomeWorkspace();
    },
    [clientRouteConversationId, openHomeWorkspace, pathname]
  );

  const handleCreateDraftSelection = useCallback(
    (mentorId: string | null, workspaceId: string | null = null) => {
      const draft = getOrCreateDraft(mentorId, workspaceId);
      const next: SelectedChat = {
        kind: 'draft',
        draftId: draft.id,
        mentorId,
        workspaceId,
      };
      prepareForChatSwitchRef.current(next);
      if (clientRouteConversationId || pathname !== '/home') {
        persistHomeSelectionHandoff({ kind: 'draft', draft });
      }
      selectedChatRef.current = next;
      setSelectedChat(next);
      openHomeWorkspace();
    },
    [clientRouteConversationId, getOrCreateDraft, openHomeWorkspace, pathname]
  );

  const handleCreateTemporaryChat = useCallback(() => {
    const now = new Date().toISOString();
    const chat: TemporaryChatSession = {
      id: crypto.randomUUID(),
      title: TEMP_CHAT_TITLE,
      createdAt: now,
      updatedAt: now,
      messages: [],
      branches: [],
      selectedBranchIds: {},
      threadsMap: {},
      threadMessages: {},
      threadStatuses: {},
    };
    const next: SelectedChat = { kind: 'temporary', tempChatId: chat.id };
    prepareForChatSwitchRef.current(next);
    setTemporaryChats((prev) => [chat, ...prev]);
    if (clientRouteConversationId || pathname !== '/home') {
      persistHomeSelectionHandoff({ kind: 'temporary', tempChatId: chat.id });
    }
    selectedChatRef.current = next;
    setSelectedChat(next);
    openHomeWorkspace();
  }, [clientRouteConversationId, openHomeWorkspace, pathname]);

  const handleCloseTemporaryChat = useCallback(
    (tempChatId: string) => {
      closeTempChatCleanupRef.current(tempChatId);
      const remaining = temporaryChats.filter((c) => c.id !== tempChatId);
      setTemporaryChats(remaining);

      // If the closed chat wasn't selected, nothing else to do
      if (
        selectedChat?.kind !== 'temporary' ||
        selectedChat.tempChatId !== tempChatId
      ) {
        return;
      }

      // Auto-select the next available chat
      const nextTemp = remaining[0];
      if (nextTemp) {
        handleSelectTemporaryChat(nextTemp.id);
        return;
      }

      const latest = conversations[0];
      if (latest) {
        handleSelectConversation(latest);
        return;
      }

      prepareForChatSwitchRef.current(null);
      setSelectedChat(null);
    },
    [
      conversations,
      handleSelectConversation,
      handleSelectTemporaryChat,
      selectedChat,
      temporaryChats,
    ]
  );

  // ------------------------------------------------------------------
  // Load sidebar data on mount
  // ------------------------------------------------------------------

  useEffect(() => {
    if (skipInitialSidebarRefresh || initialNavigationData) {
      return;
    }
    void refreshSidebarData();
  }, [initialNavigationData, skipInitialSidebarRefresh, refreshSidebarData]);

  const value: HomeDataContextValue = {
    mentors,
    workspaces,
    conversations,
    chatModels: initialChatModels,
    workspaceGroups,
    mentorGroups,
    loadingLists,
    listError,
    setListError,
    refreshSidebarData,
    upsertSidebarConversation,
    upsertWorkspaceSummary,
    removeWorkspaceSummary,
    rollbackProvisionalChatPromotion,
    loadConversationById,
    loadConversationMessages,
    draftChats,
    setDraftChats,
    temporaryChats,
    setTemporaryChats,
    updateDraftChat,
    updateTemporaryChat,
    getOrCreateDraft,
    selectedChat,
    setSelectedChat,
    selectedChatRef,
    persistentConversationCache,
    clearPersistentConversationCache,
    getPersistentConversationTranscript,
    setPersistentConversationTranscript,
    loadPersistentConversationTranscript,
    updatePersistentConversationTranscript,
    getTranscriptScrollPosition,
    setTranscriptScrollPosition,
    handleSelectConversation,
    handleSelectDraft,
    handleSelectTemporaryChat,
    handleCreateDraftSelection,
    handleCreateTemporaryChat,
    handleCloseTemporaryChat,
    registerPrepareForChatSwitch,
    invokePrepareForChatSwitch,
    registerCloseTempChatCleanup,
    openPersistentConversation,
    replacePersistentConversationUrl,
    openHomeWorkspace,
    openWorkspace,
    buildHomeHref,
    routeConversationId: clientRouteConversationId,
    pendingRouteConversationId,
    clearPendingRouteConversationId,
    e2eQueryParam,
  };

  return (
    <HomeDataContext.Provider value={value}>
      {children}
    </HomeDataContext.Provider>
  );
}

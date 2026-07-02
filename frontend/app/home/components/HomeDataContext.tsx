'use client';

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useHomeData } from '@/app/home/components/useHomeData';
import {
  createTemporaryId,
  DEFAULT_TEMPORARY_MEMORY_MODE,
  type TemporaryMemoryMode,
} from '@/lib/chat-session';
import type {
  ConversationListItem,
  SidebarMentorGroup,
  SidebarWorkspaceGroup,
} from '@/app/home/types';
import type { MentorListItem } from '@/lib/mentors/types';
import type { WorkspaceListItem } from '@/lib/workspaces';
import type { ConversationBranch, BranchSelectionMap, Message } from '@/app/home/types';
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

const TEMP_CHAT_TITLE = 'Temporary chat';
const TEMP_CHAT_STORAGE_KEY = 'keen-home-temp-chats-v1';
const HOME_SELECTION_HANDOFF_STORAGE_KEY = 'keen-home-selection-handoff-v1';

// ---------------------------------------------------------------------------
// Temporary chat sessionStorage serialization
// ---------------------------------------------------------------------------

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

function sortByUpdatedAtDesc<T extends { updatedAt: string }>(items: T[]): T[] {
  return [...items].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

function deserializeTemporaryChats(raw: string): TemporaryChatSession[] {
  const stored = JSON.parse(raw) as StoredTemporaryChatSession[];
  return stored.map((chat) => ({
    ...chat,
    messages: chat.messages.map(fromStoredMessage),
    threadMessages: Object.fromEntries(
      Object.entries(chat.threadMessages).map(([threadId, msgs]) => [
        threadId,
        msgs.map(fromStoredThreadMessage),
      ])
    ),
  }));
}

function serializeTemporaryChats(chats: TemporaryChatSession[]): string {
  const stored: StoredTemporaryChatSession[] = chats.map((chat) => ({
    ...chat,
    messages: chat.messages.map(toStoredMessage),
    threadMessages: Object.fromEntries(
      Object.entries(chat.threadMessages).map(([threadId, msgs]) => [
        threadId,
        msgs.map(toStoredThreadMessage),
      ])
    ),
  }));
  return JSON.stringify(stored);
}

// ---------------------------------------------------------------------------
// Context value shape
// ---------------------------------------------------------------------------

interface HomeDataContextValue {
  // Sidebar data
  mentors: MentorListItem[];
  workspaces: WorkspaceListItem[];
  conversations: ConversationListItem[];
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
  openWorkspace: (workspaceId: string) => void;
  buildHomeHref: (pathname: string) => string;
  routeConversationId: string | null;
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
}

export function HomeDataProvider({
  children,
  routeConversationId,
  e2eQueryParam,
  skipInitialSidebarRefresh = false,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();

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
    loadConversationById,
    loadConversationMessages,
  } = useHomeData();

  const [draftChats, setDraftChats] = useState<PersistentDraftChat[]>([]);
  const [temporaryChats, setTemporaryChats] = useState<TemporaryChatSession[]>([]);
  const [selectedChat, setSelectedChat] = useState<SelectedChat | null>(null);
  const [clientRouteConversationId, setClientRouteConversationId] =
    useState<string | null>(routeConversationId);

  const selectedChatRef = useRef<SelectedChat | null>(null);
  // Keep ref aligned with state for async handlers (same pattern as page used before lift)
  selectedChatRef.current = selectedChat;

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
      return;
    }
    window.sessionStorage.setItem(TEMP_CHAT_STORAGE_KEY, serializeTemporaryChats(temporaryChats));
  }, [temporaryChats]);

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
    router.push(buildHomeHref('/home'), { scroll: false });
  }, [buildHomeHref, clientRouteConversationId, pathname, router]);

  const openWorkspace = useCallback(
    (workspaceId: string) => {
      const href = buildHomeHref(`/workspaces/${encodeURIComponent(workspaceId)}`);
      setClientRouteConversationId(null);
      router.push(href, { scroll: false });
    },
    [buildHomeHref, router]
  );

  const openPersistentConversation = useCallback(
    (conversationId: string, options?: { replace?: boolean }) => {
      const href = buildHomeHref(`/home/${encodeURIComponent(conversationId)}`);
      setClientRouteConversationId(conversationId);
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
      window.history.replaceState(window.history.state, '', href);
    },
    [buildHomeHref]
  );

  // ------------------------------------------------------------------
  // Selection actions
  // ------------------------------------------------------------------

  const handleSelectConversation = useCallback(
    (conversation: ConversationListItem) => {
      openPersistentConversation(conversation.id);
    },
    [openPersistentConversation]
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
      id: createTemporaryId('temporary-chat'),
      title: TEMP_CHAT_TITLE,
      memoryMode: DEFAULT_TEMPORARY_MEMORY_MODE,
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
    if (skipInitialSidebarRefresh) {
      return;
    }
    void refreshSidebarData();
  }, [skipInitialSidebarRefresh, refreshSidebarData]);

  const value: HomeDataContextValue = {
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
    e2eQueryParam,
  };

  return (
    <HomeDataContext.Provider value={value}>
      {children}
    </HomeDataContext.Provider>
  );
}

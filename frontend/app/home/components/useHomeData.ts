import { useCallback, useEffect, useRef, useState } from 'react';
import type { MentorListItem } from '@/lib/mentors/types';
import type {
  ConversationListItem,
} from '@/app/home/types';
import type { WorkspaceSummary } from '@/lib/workspaces';
import {
  buildSidebarGroups,
  buildWorkspaceGroups,
  mapConversationSummary,
  sortConversationsByUpdatedAtDesc,
  type ConversationSummaryRow,
  type HomeNavigationData,
  type HomeNavigationStatus,
} from '@/app/home/components/homeSidebarData';
import { loadCompleteConversationTranscript } from '@/app/home/components/conversationTranscriptData';

const HOME_NAVIGATION_RETRY_TIMEOUT_MS = 2_000;
const HOME_TRANSCRIPT_RETRY_TIMEOUT_MS = 4_000;

type ConversationRow = ConversationSummaryRow;

type SidebarConversationInput = {
  id: string;
  title?: string | null;
  mentorId?: string | null;
  workspaceId?: string | null;
  updatedAt?: string | null;
  createdAt?: string | null;
};

export function useHomeData(
  initialData?: HomeNavigationData | null,
  initialStatus?: HomeNavigationStatus
) {
  const [mentors, setMentors] = useState<MentorListItem[]>(initialData?.mentors ?? []);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>(
    initialData?.workspaces ?? []
  );
  const [conversations, setConversations] = useState<ConversationListItem[]>(
    initialData?.conversations ?? []
  );
  const [workspaceGroups, setWorkspaceGroups] = useState(() =>
    buildWorkspaceGroups(
      initialData?.workspaces ?? [],
      initialData?.conversations ?? []
    )
  );
  const [mentorGroups, setMentorGroups] = useState(() =>
    buildSidebarGroups(
      initialData?.mentors ?? [],
      initialData?.conversations ?? []
    )
  );
  const [loadingLists, setLoadingLists] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [navigationStatus, setNavigationStatus] = useState<HomeNavigationStatus>(
    initialStatus ?? {
      mentors: { status: 'ready' },
      workspaces: { status: 'ready' },
      conversations: { status: 'ready' },
    }
  );
  const mentorsRef = useRef<MentorListItem[]>(initialData?.mentors ?? []);
  const workspacesRef = useRef<WorkspaceSummary[]>(
    initialData?.workspaces ?? []
  );
  const conversationsRef = useRef<ConversationListItem[]>(
    initialData?.conversations ?? []
  );
  const refreshSidebarPromiseRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    if (!initialData || !initialStatus) return;
    if (initialStatus.mentors.status === 'ready') {
      mentorsRef.current = initialData.mentors;
      setMentors(initialData.mentors);
    }
    if (initialStatus.workspaces.status === 'ready') {
      workspacesRef.current = initialData.workspaces;
      setWorkspaces(initialData.workspaces);
    }
    if (initialStatus.conversations.status === 'ready') {
      conversationsRef.current = initialData.conversations;
      setConversations(initialData.conversations);
    }
    setWorkspaceGroups(
      buildWorkspaceGroups(workspacesRef.current, conversationsRef.current)
    );
    setMentorGroups(
      buildSidebarGroups(mentorsRef.current, conversationsRef.current)
    );
    setNavigationStatus(initialStatus);
  }, [initialData, initialStatus]);

  const loadMentors = useCallback(async (): Promise<MentorListItem[]> => {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      HOME_NAVIGATION_RETRY_TIMEOUT_MS
    );
    try {
      const response = await fetch('/api/mentors', {
        cache: 'no-store',
        signal: controller.signal,
      });
      const data = await response.json();

      if (!response.ok || data.error) {
        throw new Error('Failed to load mentors');
      }

      return data as MentorListItem[];
    } finally {
      clearTimeout(timeout);
    }
  }, []);

  const loadWorkspaces = useCallback(async (): Promise<WorkspaceSummary[]> => {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      HOME_NAVIGATION_RETRY_TIMEOUT_MS
    );
    try {
      const response = await fetch('/api/workspaces', {
        cache: 'no-store',
        signal: controller.signal,
      });
      const data = await response.json();

      if (!response.ok || data.error) {
        throw new Error('Failed to load workspaces');
      }

      return Array.isArray(data.workspaces) ? data.workspaces : [];
    } finally {
      clearTimeout(timeout);
    }
  }, []);

  const loadConversations = useCallback(async (): Promise<ConversationRow[]> => {
    const { supabase } = await import('@/lib/supabase');
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      HOME_NAVIGATION_RETRY_TIMEOUT_MS
    );
    try {
      const { data: conversationRows, error: conversationError } = await supabase
        .from('conversations')
        .select('id, title, mentor_id, workspace_id, updated_at, created_at')
        .order('updated_at', { ascending: false })
        .limit(200)
        .abortSignal(controller.signal);

      if (conversationError) {
        if (controller.signal.aborted) {
          throw new DOMException('Navigation request timed out', 'AbortError');
        }
        throw new Error('Failed to load conversations');
      }

      return (conversationRows || []) as ConversationRow[];
    } finally {
      clearTimeout(timeout);
    }
  }, []);

  const refreshSidebarData = useCallback(() => {
    if (refreshSidebarPromiseRef.current) {
      return refreshSidebarPromiseRef.current;
    }

    setLoadingLists(true);
    setListError(null);
    const refresh = (async () => {
      try {
        const [
          mentorResult,
          workspaceResult,
          conversationResult,
        ] = await Promise.allSettled([
          loadMentors(),
          loadWorkspaces(),
          loadConversations(),
        ]);
        const nextStatus: HomeNavigationStatus = {
          mentors:
            mentorResult.status === 'fulfilled'
              ? { status: 'ready' }
              : {
                  status: 'unavailable',
                  reason:
                    mentorResult.reason instanceof DOMException
                    && mentorResult.reason.name === 'AbortError'
                      ? 'timeout'
                      : 'error',
                },
          workspaces:
            workspaceResult.status === 'fulfilled'
              ? { status: 'ready' }
              : {
                  status: 'unavailable',
                  reason:
                    workspaceResult.reason instanceof DOMException
                    && workspaceResult.reason.name === 'AbortError'
                      ? 'timeout'
                      : 'error',
                },
          conversations:
            conversationResult.status === 'fulfilled'
              ? { status: 'ready' }
              : {
                  status: 'unavailable',
                  reason:
                    conversationResult.reason instanceof DOMException
                    && conversationResult.reason.name === 'AbortError'
                      ? 'timeout'
                      : 'error',
                },
        };

        if (mentorResult.status === 'fulfilled') {
          mentorsRef.current = mentorResult.value;
          setMentors(mentorResult.value);
        }
        if (workspaceResult.status === 'fulfilled') {
          workspacesRef.current = workspaceResult.value;
          setWorkspaces(workspaceResult.value);
        }
        if (conversationResult.status === 'fulfilled') {
          const nextConversations = conversationResult.value.map((row) =>
            mapConversationSummary(
              row,
              mentorsRef.current,
              workspacesRef.current
            )
          );
          conversationsRef.current = nextConversations;
          setConversations(nextConversations);
        }
        setWorkspaceGroups(
          buildWorkspaceGroups(workspacesRef.current, conversationsRef.current)
        );
        setMentorGroups(
          buildSidebarGroups(mentorsRef.current, conversationsRef.current)
        );
        setNavigationStatus(nextStatus);
      } finally {
        setLoadingLists(false);
      }
    })();
    refreshSidebarPromiseRef.current = refresh;
    const clearRefresh = () => {
      if (refreshSidebarPromiseRef.current === refresh) {
        refreshSidebarPromiseRef.current = null;
      }
    };
    void refresh.then(clearRefresh, clearRefresh);
    return refresh;
  }, [loadConversations, loadMentors, loadWorkspaces]);

  const upsertSidebarConversation = useCallback((conversation: SidebarConversationInput) => {
    const now = new Date().toISOString();
    const row: ConversationRow = {
      id: conversation.id,
      title: conversation.title ?? null,
      mentor_id: conversation.mentorId ?? null,
      workspace_id: conversation.workspaceId ?? null,
      updated_at: conversation.updatedAt ?? now,
      created_at: conversation.createdAt ?? conversation.updatedAt ?? now,
    };
    const nextConversation = mapConversationSummary(
      row,
      mentorsRef.current,
      workspacesRef.current
    );
    const nextConversations = sortConversationsByUpdatedAtDesc([
      nextConversation,
      ...conversationsRef.current.filter((entry) => entry.id !== nextConversation.id),
    ]);

    conversationsRef.current = nextConversations;
    setConversations(nextConversations);
    setWorkspaceGroups(
      buildWorkspaceGroups(workspacesRef.current, nextConversations)
    );
    setMentorGroups(buildSidebarGroups(mentorsRef.current, nextConversations));
  }, []);

  const getSidebarConversation = useCallback(
    (conversationId: string) =>
      conversationsRef.current.find(
        (conversation) => conversation.id === conversationId
      ) ?? null,
    []
  );

  const removeSidebarConversation = useCallback((conversationId: string) => {
    const nextConversations = conversationsRef.current.filter(
      (entry) => entry.id !== conversationId
    );
    if (nextConversations.length === conversationsRef.current.length) {
      return;
    }

    conversationsRef.current = nextConversations;
    setConversations(nextConversations);
    setWorkspaceGroups(
      buildWorkspaceGroups(workspacesRef.current, nextConversations)
    );
    setMentorGroups(buildSidebarGroups(mentorsRef.current, nextConversations));
  }, []);

  const upsertWorkspaceSummary = useCallback((workspace: WorkspaceSummary) => {
    const nextWorkspaces = [
      workspace,
      ...workspacesRef.current.filter((entry) => entry.id !== workspace.id),
    ];
    const nextConversations = conversationsRef.current.map((conversation) =>
      conversation.workspace_id === workspace.id
        ? {
            ...conversation,
            workspace_name: workspace.name,
            workspace_icon: workspace.icon,
            workspace_accent_color: workspace.accent_color,
          }
        : conversation
    );

    workspacesRef.current = nextWorkspaces;
    conversationsRef.current = nextConversations;
    setWorkspaces(nextWorkspaces);
    setConversations(nextConversations);
    setWorkspaceGroups(buildWorkspaceGroups(nextWorkspaces, nextConversations));
    setMentorGroups(buildSidebarGroups(mentorsRef.current, nextConversations));
  }, []);

  const removeWorkspaceSummary = useCallback((workspaceId: string) => {
    const nextWorkspaces = workspacesRef.current.filter(
      (entry) => entry.id !== workspaceId
    );
    const nextConversations = conversationsRef.current.filter(
      (conversation) => conversation.workspace_id !== workspaceId
    );

    workspacesRef.current = nextWorkspaces;
    conversationsRef.current = nextConversations;
    setWorkspaces(nextWorkspaces);
    setConversations(nextConversations);
    setWorkspaceGroups(buildWorkspaceGroups(nextWorkspaces, nextConversations));
    setMentorGroups(buildSidebarGroups(mentorsRef.current, nextConversations));
  }, []);

  const loadConversationMessages = useCallback(async (nextConversationId: string) => {
    const { supabase } = await import('@/lib/supabase');
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      HOME_TRANSCRIPT_RETRY_TIMEOUT_MS
    );
    try {
      return await loadCompleteConversationTranscript(
        supabase,
        nextConversationId,
        {
          signal: controller.signal,
          optionalMetadataTimeoutMs: HOME_NAVIGATION_RETRY_TIMEOUT_MS,
        }
      );
    } finally {
      clearTimeout(timeout);
    }
  }, []);

  const loadConversationById = useCallback(async (nextConversationId: string) => {
    const { supabase } = await import('@/lib/supabase');
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      HOME_TRANSCRIPT_RETRY_TIMEOUT_MS
    );
    try {
      const { data, error, status } = await supabase
        .from('conversations')
        .select('id, title, mentor_id, workspace_id, updated_at, created_at')
        .eq('id', nextConversationId)
        .abortSignal(controller.signal)
        .maybeSingle();

      if (controller.signal.aborted) {
        throw new Error('The conversation took too long to load.');
      }
      const row = data as ConversationRow | null;
      if (error) {
        const errorCode =
          typeof error === 'object' && error !== null && 'code' in error
            ? String(error.code)
            : '';
        if (status === 404 || errorCode === 'PGRST116') {
          throw new Error('Conversation not found');
        }
        throw new Error('The conversation could not be loaded.');
      }
      if (!row || row.id !== nextConversationId) {
        throw new Error('Conversation not found');
      }

      return mapConversationSummary(
        row,
        mentorsRef.current,
        workspacesRef.current
      );
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error('The conversation took too long to load.');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }, []);

  return {
    mentors,
    workspaces,
    conversations,
    workspaceGroups,
    mentorGroups,
    loadingLists,
    listError,
    navigationStatus,
    setListError,
    refreshSidebarData,
    getSidebarConversation,
    upsertSidebarConversation,
    removeSidebarConversation,
    upsertWorkspaceSummary,
    removeWorkspaceSummary,
    loadConversationById,
    loadConversationMessages,
  };
}

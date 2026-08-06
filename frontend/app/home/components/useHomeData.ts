import { useCallback, useRef, useState } from 'react';
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
} from '@/app/home/components/homeSidebarData';
import { loadCompleteConversationTranscript } from '@/app/home/components/conversationTranscriptData';

type ConversationRow = ConversationSummaryRow;

type SidebarConversationInput = {
  id: string;
  title?: string | null;
  mentorId?: string | null;
  workspaceId?: string | null;
  updatedAt?: string | null;
  createdAt?: string | null;
};

export function useHomeData(initialData?: HomeNavigationData | null) {
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
  const mentorsRef = useRef<MentorListItem[]>(initialData?.mentors ?? []);
  const workspacesRef = useRef<WorkspaceSummary[]>(
    initialData?.workspaces ?? []
  );
  const conversationsRef = useRef<ConversationListItem[]>(
    initialData?.conversations ?? []
  );

  const loadMentors = useCallback(async (): Promise<MentorListItem[]> => {
    const response = await fetch('/api/mentors', { cache: 'no-store' });
    const data = await response.json();

    if (!response.ok || data.error) {
      throw new Error(data.error || 'Failed to load mentors');
    }

    return data as MentorListItem[];
  }, []);

  const loadWorkspaces = useCallback(async (): Promise<WorkspaceSummary[]> => {
    const response = await fetch('/api/workspaces', { cache: 'no-store' });
    const data = await response.json();

    if (!response.ok || data.error) {
      throw new Error(data.error || 'Failed to load workspaces');
    }

    return Array.isArray(data.workspaces) ? data.workspaces : [];
  }, []);

  const loadConversations = useCallback(async (
    mentorSource: MentorListItem[],
    workspaceSource: WorkspaceSummary[]
  ) => {
    const { supabase } = await import('@/lib/supabase');
    const { data: conversationRows, error: conversationError } = await supabase
      .from('conversations')
      .select('id, title, mentor_id, workspace_id, updated_at, created_at')
      .order('updated_at', { ascending: false })
      .limit(200);

    if (conversationError) {
      throw new Error(conversationError.message);
    }

    const rows = (conversationRows || []) as ConversationRow[];
    const nextConversations: ConversationListItem[] = rows.map((row) =>
      mapConversationSummary(row, mentorSource, workspaceSource)
    );

    conversationsRef.current = nextConversations;
    setConversations(nextConversations);
    setWorkspaceGroups(buildWorkspaceGroups(workspaceSource, nextConversations));
    setMentorGroups(buildSidebarGroups(mentorSource, nextConversations));
  }, []);

  const refreshSidebarData = useCallback(async () => {
    setLoadingLists(true);
    setListError(null);

    try {
      const [nextMentors, nextWorkspaces] = await Promise.all([
        loadMentors(),
        loadWorkspaces(),
      ]);
      mentorsRef.current = nextMentors;
      workspacesRef.current = nextWorkspaces;
      setMentors(nextMentors);
      setWorkspaces(nextWorkspaces);
      await loadConversations(nextMentors, nextWorkspaces);
    } catch (error) {
      setListError(
        error instanceof Error
          ? error.message
          : 'Failed to load mentors and conversations'
      );
    } finally {
      setLoadingLists(false);
    }
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
    return loadCompleteConversationTranscript(supabase, nextConversationId);
  }, []);

  const loadConversationById = useCallback(async (nextConversationId: string) => {
    const { supabase } = await import('@/lib/supabase');
    const { data, error } = await supabase
      .from('conversations')
      .select('id, title, mentor_id, workspace_id, updated_at, created_at')
      .eq('id', nextConversationId)
      .single();

    const row = data as ConversationRow | null;

    if (error || !row || row.id !== nextConversationId) {
      throw new Error(error?.message || 'Conversation not found');
    }

    return mapConversationSummary(
      row,
      mentorsRef.current,
      workspacesRef.current
    );
  }, []);

  return {
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
  };
}

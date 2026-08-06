import { useCallback, useRef, useState } from 'react';
import type { MentorListItem } from '@/lib/mentors/types';
import { parsePersistedSearchMetadata } from '@/lib/search-citations';
import {
  type ChatImageAttachment,
  type ChatImageMimeType,
} from '@/lib/chat-attachments';
import type {
  BranchSelectionMap,
  ConversationBranch,
  ConversationListItem,
  Message,
} from '@/app/home/types';
import type { ThreadMeta } from '@/app/home/components/threadTypes';
import { buildInitialBranchSelections } from '@/app/home/components/conversationTree';
import type { WorkspaceSummary } from '@/lib/workspaces';
import { getSelectionStreamVersion } from '@/app/home/components/markdownSelectableStream';
import {
  buildSidebarGroups,
  buildWorkspaceGroups,
  mapConversationSummary,
  sortConversationsByUpdatedAtDesc,
  type ConversationSummaryRow,
  type HomeNavigationData,
} from '@/app/home/components/homeSidebarData';
import { fetchCompleteMainTranscript } from '@/app/home/components/conversationTranscriptData';

type ConversationRow = ConversationSummaryRow;

type SidebarConversationInput = {
  id: string;
  title?: string | null;
  mentorId?: string | null;
  workspaceId?: string | null;
  updatedAt?: string | null;
  createdAt?: string | null;
};


function buildThreadsMap(
  threadRows: Array<{
    id: string;
    source_message_id: string;
    highlighted_text: string;
    start_offset: number;
    end_offset: number;
    selection_stream_version?: string | null;
  }>
) {
  const nextThreadsMap = new Map<string, ThreadMeta[]>();

  for (const thread of threadRows) {
    const key = thread.source_message_id;
    const existing = nextThreadsMap.get(key) || [];
    existing.push({
      threadId: thread.id,
      highlightedText: thread.highlighted_text,
      sourceMessageId: thread.source_message_id,
      startOffset: thread.start_offset,
      endOffset: thread.end_offset,
      selectionStreamVersion: getSelectionStreamVersion(thread.selection_stream_version),
    });
    nextThreadsMap.set(key, existing);
  }

  return nextThreadsMap;
}

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
    const messagesRequest = fetchCompleteMainTranscript(
      supabase,
      nextConversationId
    );

    const branchesRequest = supabase
      .from('conversation_branches')
      .select('id, source_message_id, entry_message_id, title, is_main, position')
      .eq('conversation_id', nextConversationId)
      .order('position', { ascending: true });

    const threadsRequest = supabase
      .from('threads')
      .select('id, source_message_id, highlighted_text, start_offset, end_offset, selection_stream_version')
      .eq('conversation_id', nextConversationId);

    const [
      transcriptResult,
      { data: branchRows, error: branchesError },
      { data: threadRows, error: threadsError },
    ] = await Promise.all([messagesRequest, branchesRequest, threadsRequest]);

    const nextMessages: Message[] = transcriptResult.rows.map((message) => {
      const searchMetadata = parsePersistedSearchMetadata(message.search_metadata);

      return {
        id: message.id,
        role: message.role,
        content: message.content,
        timestamp: new Date(message.created_at),
        searchMetadata,
        searchActivity: searchMetadata?.version === 2 ? searchMetadata.activity ?? null : null,
        previousMessageId: message.previous_message_id ?? null,
      };
    });

    const messageIds = nextMessages.map((message) => message.id);
    if (messageIds.length > 0) {
      const attachmentResponses = await Promise.all(
        Array.from(
          { length: Math.ceil(messageIds.length / 100) },
          (_, index) => messageIds.slice(index * 100, (index + 1) * 100)
        ).map((messageIdChunk) =>
          supabase
            .from('message_attachments')
            .select(
              'id, message_id, storage_path, file_name, mime_type, size_bytes, width, height'
            )
            .in('message_id', messageIdChunk)
            .order('position', { ascending: true })
        )
      );
      const attachmentsError = attachmentResponses.find(
        (response) => response.error
      )?.error;
      const attachmentRows = attachmentResponses.flatMap(
        (response) => response.data ?? []
      );

      if (!attachmentsError && attachmentRows && attachmentRows.length > 0) {
        const rows = attachmentRows as Array<{
          id: string;
          message_id: string;
          storage_path: string;
          file_name: string;
          mime_type: ChatImageMimeType;
          size_bytes: number;
          width: number | null;
          height: number | null;
        }>;
        const attachmentsByMessageId = new Map<string, ChatImageAttachment[]>();

        for (const row of rows) {
          const existing = attachmentsByMessageId.get(row.message_id) || [];
          existing.push({
            id: row.id,
            messageId: row.message_id,
            storagePath: row.storage_path,
            fileName: row.file_name,
            mimeType: row.mime_type,
            sizeBytes: row.size_bytes,
            width: row.width,
            height: row.height,
            url: `/api/chat/images/${row.id}`,
          });
          attachmentsByMessageId.set(row.message_id, existing);
        }

        for (const message of nextMessages) {
          message.attachments = attachmentsByMessageId.get(message.id) || [];
        }
      } else if (attachmentsError) {
        console.error('Failed to load message attachments:', attachmentsError);
      }
    }

    const nextBranches: ConversationBranch[] = branchesError
      ? []
      : ((branchRows || []) as Array<{
          id: string;
          source_message_id: string;
          entry_message_id: string;
          title: string;
          is_main: boolean;
          position: number;
        }>).map((branch) => ({
          id: branch.id,
          sourceMessageId: branch.source_message_id,
          entryMessageId: branch.entry_message_id,
          title: branch.title,
          isMain: branch.is_main,
          position: branch.position,
        }));

    if (threadsError) {
      console.error('Failed to load threads:', threadsError);

      return {
        messages: nextMessages,
        branches: nextBranches,
        selectedBranchIds: buildInitialBranchSelections(nextBranches) as BranchSelectionMap,
        threadsMap: new Map<string, ThreadMeta[]>(),
        isComplete: transcriptResult.isComplete,
      };
    }

    return {
      messages: nextMessages,
      branches: nextBranches,
      selectedBranchIds: buildInitialBranchSelections(nextBranches) as BranchSelectionMap,
      threadsMap: buildThreadsMap(
        (threadRows || []) as Array<{
          id: string;
          source_message_id: string;
          highlighted_text: string;
          start_offset: number;
          end_offset: number;
          selection_stream_version?: string | null;
        }>
      ),
      isComplete: transcriptResult.isComplete,
    };
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

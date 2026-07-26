import { useCallback, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
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
  SidebarMentorGroup,
  SidebarWorkspaceGroup,
} from '@/app/home/types';
import type { ThreadMeta } from '@/app/home/components/threadTypes';
import { buildInitialBranchSelections } from '@/app/home/components/conversationTree';
import type { WorkspaceListItem } from '@/lib/workspaces';
import { getSelectionStreamVersion } from '@/app/home/components/markdownSelectableStream';

interface ConversationRow {
  id: string;
  title: string | null;
  mentor_id: string | null;
  workspace_id: string | null;
  updated_at: string;
  created_at: string;
}

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

function buildSidebarGroups(
  mentorSource: MentorListItem[],
  conversationSource: ConversationListItem[]
): SidebarMentorGroup[] {
  const groups: SidebarMentorGroup[] = [
    {
      mentor_id: null,
      mentor_name: 'Keen',
      mentor_accent_color: null,
      last_activity_at: null,
      conversations: [],
    },
    ...mentorSource.map((mentor) => ({
      mentor_id: mentor.id,
      mentor_name: mentor.name,
      mentor_accent_color: mentor.accent_color,
      last_activity_at: null,
      conversations: [],
    })),
  ];

  const groupByMentorId = new Map(
    groups.map((group) => [group.mentor_id ?? '__keen__', group])
  );

  for (const conversation of conversationSource.filter((entry) => !entry.workspace_id)) {
    const key = conversation.mentor_id ?? '__keen__';
    const group = groupByMentorId.get(key);

    if (!group) {
      continue;
    }

    group.conversations.push(conversation);

    if (
      !group.last_activity_at ||
      new Date(conversation.updated_at).getTime() >
        new Date(group.last_activity_at).getTime()
    ) {
      group.last_activity_at = conversation.updated_at;
    }
  }

  for (const group of groups) {
    group.conversations.sort(
      (a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );
  }

  const activeGroups = groups
    .filter((group) => group.last_activity_at)
    .sort(
      (a, b) =>
        new Date(b.last_activity_at || 0).getTime() -
        new Date(a.last_activity_at || 0).getTime()
    );

  const inactiveGroups = groups
    .filter((group) => !group.last_activity_at)
    .sort((a, b) => a.mentor_name.localeCompare(b.mentor_name));

  return [...activeGroups, ...inactiveGroups];
}

function buildWorkspaceGroups(
  workspaceSource: WorkspaceListItem[],
  conversationSource: ConversationListItem[]
): SidebarWorkspaceGroup[] {
  const groups = workspaceSource.map((workspace) => ({
    workspace_id: workspace.id,
    workspace_name: workspace.name,
    workspace_icon: workspace.icon,
    workspace_accent_color: workspace.accent_color,
    workspace_description: workspace.description,
    last_activity_at: null as string | null,
    conversations: [] as ConversationListItem[],
  }));

  const groupByWorkspaceId = new Map(
    groups.map((group) => [group.workspace_id, group])
  );

  for (const conversation of conversationSource) {
    if (!conversation.workspace_id) continue;
    const group = groupByWorkspaceId.get(conversation.workspace_id);
    if (!group) continue;

    group.conversations.push(conversation);
    if (
      !group.last_activity_at ||
      new Date(conversation.updated_at).getTime() >
        new Date(group.last_activity_at).getTime()
    ) {
      group.last_activity_at = conversation.updated_at;
    }
  }

  for (const group of groups) {
    group.conversations.sort(
      (a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );
  }

  return groups.sort((a, b) => {
    const aTime = a.last_activity_at ? new Date(a.last_activity_at).getTime() : 0;
    const bTime = b.last_activity_at ? new Date(b.last_activity_at).getTime() : 0;
    if (aTime !== bTime) return bTime - aTime;
    return a.workspace_name.localeCompare(b.workspace_name);
  });
}

function mapConversationRowToListItem(
  row: ConversationRow,
  mentorSource: MentorListItem[],
  workspaceSource: WorkspaceListItem[]
): ConversationListItem {
  const mentor = row.mentor_id
    ? mentorSource.find((entry) => entry.id === row.mentor_id) || null
    : null;
  const workspace = row.workspace_id
    ? workspaceSource.find((entry) => entry.id === row.workspace_id) || null
    : null;

  return {
    id: row.id,
    title: row.title?.trim() || 'New chat',
    mentor_id: row.mentor_id ?? null,
    workspace_id: row.workspace_id ?? null,
    updated_at: row.updated_at,
    created_at: row.created_at,
    mentor_name: mentor?.name || 'Keen',
    mentor_accent_color: mentor?.accent_color || null,
    workspace_name: workspace?.name || null,
    workspace_icon: workspace?.icon || null,
    workspace_accent_color: workspace?.accent_color || null,
  };
}

function sortConversationsByUpdatedAtDesc(
  conversationSource: ConversationListItem[]
): ConversationListItem[] {
  return [...conversationSource].sort(
    (a, b) =>
      new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  );
}

export function useHomeData() {
  const [mentors, setMentors] = useState<MentorListItem[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceListItem[]>([]);
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [workspaceGroups, setWorkspaceGroups] = useState<SidebarWorkspaceGroup[]>([]);
  const [mentorGroups, setMentorGroups] = useState<SidebarMentorGroup[]>([]);
  const [loadingLists, setLoadingLists] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const conversationsRef = useRef<ConversationListItem[]>([]);

  const loadMentors = useCallback(async (): Promise<MentorListItem[]> => {
    const response = await fetch('/api/mentors', { cache: 'no-store' });
    const data = await response.json();

    if (!response.ok || data.error) {
      throw new Error(data.error || 'Failed to load mentors');
    }

    return data as MentorListItem[];
  }, []);

  const loadWorkspaces = useCallback(async (): Promise<WorkspaceListItem[]> => {
    const response = await fetch('/api/workspaces', { cache: 'no-store' });
    const data = await response.json();

    if (!response.ok || data.error) {
      throw new Error(data.error || 'Failed to load workspaces');
    }

    return Array.isArray(data.workspaces) ? data.workspaces : [];
  }, []);

  const loadConversations = useCallback(async (
    mentorSource: MentorListItem[],
    workspaceSource: WorkspaceListItem[]
  ) => {
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
      mapConversationRowToListItem(row, mentorSource, workspaceSource)
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
    const nextConversation = mapConversationRowToListItem(row, mentors, workspaces);
    const nextConversations = sortConversationsByUpdatedAtDesc([
      nextConversation,
      ...conversationsRef.current.filter((entry) => entry.id !== nextConversation.id),
    ]);

    conversationsRef.current = nextConversations;
    setConversations(nextConversations);
    setWorkspaceGroups(buildWorkspaceGroups(workspaces, nextConversations));
    setMentorGroups(buildSidebarGroups(mentors, nextConversations));
  }, [mentors, workspaces]);

  const removeSidebarConversation = useCallback((conversationId: string) => {
    const nextConversations = conversationsRef.current.filter(
      (entry) => entry.id !== conversationId
    );
    if (nextConversations.length === conversationsRef.current.length) {
      return;
    }

    conversationsRef.current = nextConversations;
    setConversations(nextConversations);
    setWorkspaceGroups(buildWorkspaceGroups(workspaces, nextConversations));
    setMentorGroups(buildSidebarGroups(mentors, nextConversations));
  }, [mentors, workspaces]);

  const loadConversationMessages = useCallback(async (nextConversationId: string) => {
    const messagesRequest = supabase
      .from('messages')
      .select('id, role, content, created_at, search_metadata, previous_message_id')
      .eq('conversation_id', nextConversationId)
      .is('thread_id', null)
      .order('created_at', { ascending: true })
      .limit(200);

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
      { data, error },
      { data: branchRows, error: branchesError },
      { data: threadRows, error: threadsError },
    ] = await Promise.all([messagesRequest, branchesRequest, threadsRequest]);

    if (error) {
      throw new Error(error.message);
    }

    const nextMessages: Message[] = ((data || []) as Array<{
      id: string;
      role: 'user' | 'assistant';
      content: string;
      created_at: string;
      search_metadata?: unknown;
      previous_message_id: string | null;
    }>).map((message) => {
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
      const { data: attachmentRows, error: attachmentsError } = await supabase
        .from('message_attachments')
        .select('id, message_id, storage_path, file_name, mime_type, size_bytes, width, height')
        .in('message_id', messageIds)
        .order('position', { ascending: true });

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
    };
  }, []);

  const loadConversationById = useCallback(async (nextConversationId: string) => {
    const { data, error } = await supabase
      .from('conversations')
      .select('id, title, mentor_id, workspace_id, updated_at, created_at')
      .eq('id', nextConversationId)
      .single();

    const row = data as ConversationRow | null;

    if (error || !row || row.id !== nextConversationId) {
      throw new Error(error?.message || 'Conversation not found');
    }

    return mapConversationRowToListItem(row, mentors, workspaces);
  }, [mentors, workspaces]);

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
    loadConversationById,
    loadConversationMessages,
  };
}

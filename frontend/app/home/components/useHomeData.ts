import { useCallback, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { MentorListItem } from '@/lib/mentors/types';
import { parsePersistedSearchMetadata } from '@/lib/search-citations';
import {
  CHAT_IMAGE_BUCKET,
  type ChatImageAttachment,
  type ChatImageMimeType,
} from '@/lib/chat-attachments';
import type {
  BranchSelectionMap,
  ConversationBranch,
  ConversationListItem,
  Message,
  SidebarMentorGroup,
} from '@/app/home/types';
import type { ThreadMeta } from '@/app/home/components/threadTypes';
import { buildInitialBranchSelections } from '@/app/home/components/conversationTree';

interface ConversationRow {
  id: string;
  title: string | null;
  mentor_id: string | null;
  updated_at: string;
  created_at: string;
}


function buildThreadsMap(
  threadRows: Array<{
    id: string;
    source_message_id: string;
    highlighted_text: string;
    start_offset: number;
    end_offset: number;
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

  for (const conversation of conversationSource) {
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

function mapConversationRowToListItem(
  row: ConversationRow,
  mentorSource: MentorListItem[]
): ConversationListItem {
  const mentor = row.mentor_id
    ? mentorSource.find((entry) => entry.id === row.mentor_id) || null
    : null;

  return {
    id: row.id,
    title: row.title?.trim() || 'New chat',
    mentor_id: row.mentor_id,
    updated_at: row.updated_at,
    created_at: row.created_at,
    mentor_name: mentor?.name || 'Keen',
    mentor_accent_color: mentor?.accent_color || null,
  };
}

export function useHomeData() {
  const [mentors, setMentors] = useState<MentorListItem[]>([]);
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [mentorGroups, setMentorGroups] = useState<SidebarMentorGroup[]>([]);
  const [loadingLists, setLoadingLists] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const loadMentors = useCallback(async (): Promise<MentorListItem[]> => {
    const response = await fetch('/api/mentors', { cache: 'no-store' });
    const data = await response.json();

    if (!response.ok || data.error) {
      throw new Error(data.error || 'Failed to load mentors');
    }

    return data as MentorListItem[];
  }, []);

  const loadConversations = useCallback(async (mentorSource: MentorListItem[]) => {
    const { data: conversationRows, error: conversationError } = await supabase
      .from('conversations')
      .select('id, title, mentor_id, updated_at, created_at')
      .order('updated_at', { ascending: false })
      .limit(200);

    if (conversationError) {
      throw new Error(conversationError.message);
    }

    const rows = (conversationRows || []) as ConversationRow[];
    const nextConversations: ConversationListItem[] = rows.map((row) =>
      mapConversationRowToListItem(row, mentorSource)
    );

    setConversations(nextConversations);
    setMentorGroups(buildSidebarGroups(mentorSource, nextConversations));
  }, []);

  const refreshSidebarData = useCallback(async () => {
    setLoadingLists(true);
    setListError(null);

    try {
      const nextMentors = await loadMentors();
      setMentors(nextMentors);
      await loadConversations(nextMentors);
    } catch (error) {
      setListError(
        error instanceof Error
          ? error.message
          : 'Failed to load mentors and conversations'
      );
    } finally {
      setLoadingLists(false);
    }
  }, [loadConversations, loadMentors]);

  const loadConversationMessages = useCallback(async (nextConversationId: string) => {
    const { data, error } = await supabase
      .from('messages')
      .select('id, role, content, created_at, search_metadata, previous_message_id')
      .eq('conversation_id', nextConversationId)
      .is('thread_id', null)
      .order('created_at', { ascending: true })
      .limit(200);

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
    }>).map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      timestamp: new Date(message.created_at),
      searchMetadata: parsePersistedSearchMetadata(message.search_metadata),
      previousMessageId: message.previous_message_id ?? null,
    }));

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
        const signedUrls = await supabase.storage
          .from(CHAT_IMAGE_BUCKET)
          .createSignedUrls(
            rows.map((row) => row.storage_path),
            60 * 60
          );
        const signedUrlByPath = new Map(
          (signedUrls.data || []).map((entry) => [entry.path, entry.signedUrl])
        );
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
            url: signedUrlByPath.get(row.storage_path) ?? null,
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

    const { data: branchRows, error: branchesError } = await supabase
      .from('conversation_branches')
      .select('id, source_message_id, entry_message_id, title, is_main, position')
      .eq('conversation_id', nextConversationId)
      .order('position', { ascending: true });

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

    const { data: threadRows, error: threadsError } = await supabase
      .from('threads')
      .select('id, source_message_id, highlighted_text, start_offset, end_offset')
      .eq('conversation_id', nextConversationId);

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
        }>
      ),
    };
  }, []);

  const loadConversationById = useCallback(async (nextConversationId: string) => {
    const { data, error } = await supabase
      .from('conversations')
      .select('id, title, mentor_id, updated_at, created_at')
      .eq('id', nextConversationId)
      .single();

    if (error || !data) {
      throw new Error(error?.message || 'Conversation not found');
    }

    return mapConversationRowToListItem(data as ConversationRow, mentors);
  }, [mentors]);

  return {
    mentors,
    conversations,
    mentorGroups,
    loadingLists,
    listError,
    setListError,
    refreshSidebarData,
    loadConversationById,
    loadConversationMessages,
  };
}

import { useCallback, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { MentorListItem } from '@/lib/mentors/types';
import { parsePersistedSearchMetadata, stripCitationMarkers } from '@/lib/search-citations';
import type {
  ConversationListItem,
  Message,
  SidebarMentorGroup,
} from '@/app/home/types';
import type { ThreadMeta } from '@/app/home/components/threadTypes';

interface ConversationRow {
  id: string;
  title: string | null;
  mentor_id: string | null;
  updated_at: string;
  created_at: string;
}

function mapConversationPreview(preview: string) {
  return preview.length > 180 ? `${preview.slice(0, 177)}...` : preview;
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
    const mentorById = new Map(mentorSource.map((mentor) => [mentor.id, mentor]));
    const { data: conversationRows, error: conversationError } = await supabase
      .from('conversations')
      .select('id, title, mentor_id, updated_at, created_at')
      .order('updated_at', { ascending: false })
      .limit(200);

    if (conversationError) {
      throw new Error(conversationError.message);
    }

    const rows = (conversationRows || []) as ConversationRow[];
    const previews = await Promise.all(
      rows.map(async (row) => {
        const { data: latestMessage } = await supabase
          .from('messages')
          .select('content, search_metadata')
          .eq('conversation_id', row.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        const latestSearchMetadata = parsePersistedSearchMetadata(
          latestMessage?.search_metadata
        );
        return {
          conversationId: row.id,
          preview: stripCitationMarkers(latestMessage?.content || '', latestSearchMetadata),
        };
      })
    );

    const previewByConversationId = new Map(
      previews.map((item) => [item.conversationId, item.preview])
    );

    const nextConversations: ConversationListItem[] = rows.map((row) => {
      const mentor = row.mentor_id ? mentorById.get(row.mentor_id) : null;
      const preview = previewByConversationId.get(row.id) || '';

      return {
        id: row.id,
        title: row.title?.trim() || 'New chat',
        mentor_id: row.mentor_id,
        updated_at: row.updated_at,
        created_at: row.created_at,
        preview: mapConversationPreview(preview),
        mentor_name: mentor?.name || 'Keen',
        mentor_accent_color: mentor?.accent_color || null,
      };
    });

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
      .select('id, role, content, created_at, search_metadata')
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
    }>).map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      timestamp: new Date(message.created_at),
      searchMetadata: parsePersistedSearchMetadata(message.search_metadata),
    }));

    const { data: threadRows, error: threadsError } = await supabase
      .from('threads')
      .select('id, source_message_id, highlighted_text, start_offset, end_offset')
      .eq('conversation_id', nextConversationId);

    if (threadsError) {
      console.error('Failed to load threads:', threadsError);

      return {
        messages: nextMessages,
        threadsMap: new Map<string, ThreadMeta[]>(),
      };
    }

    return {
      messages: nextMessages,
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

  return {
    mentors,
    setMentors,
    conversations,
    mentorGroups,
    loadingLists,
    listError,
    setListError,
    refreshSidebarData,
    loadConversationMessages,
  };
}

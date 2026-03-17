import { useCallback, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { MentorListItem } from '@/lib/mentors/types';
import type { ConversationListItem } from '@/app/home/components/ConversationsPanel';
import type { ThreadMeta } from '@/app/home/components/MarkdownWithThreads';
import type { Message } from '@/app/home/types';

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
    });
    nextThreadsMap.set(key, existing);
  }

  return nextThreadsMap;
}

export function useHomeData() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [activeMentor, setActiveMentor] = useState<MentorListItem | null>(null);
  const [mentors, setMentors] = useState<MentorListItem[]>([]);
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [loadingLists, setLoadingLists] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [threadsMap, setThreadsMap] = useState<Map<string, ThreadMeta[]>>(new Map());

  const clearConversationState = useCallback(() => {
    setConversationId(null);
    setMessages([]);
    setThreadsMap(new Map());
  }, []);

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
      .limit(100);

    if (conversationError) {
      throw new Error(conversationError.message);
    }

    const rows = (conversationRows || []) as ConversationRow[];
    const previews = await Promise.all(
      rows.map(async (row) => {
        const { data: latestMessage } = await supabase
          .from('messages')
          .select('content')
          .eq('conversation_id', row.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        return {
          conversationId: row.id,
          preview: latestMessage?.content || '',
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
        title: row.title,
        mentor_id: row.mentor_id,
        updated_at: row.updated_at,
        created_at: row.created_at,
        preview: mapConversationPreview(preview),
        mentor_name: mentor?.name || 'Novus',
        mentor_accent_color: mentor?.accent_color || null,
      };
    });

    setConversations(nextConversations);
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
      .select('id, role, content, created_at')
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
    }>).map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      timestamp: new Date(message.created_at),
    }));

    setMessages(nextMessages);
    setConversationId(nextConversationId);

    const { data: threadRows, error: threadsError } = await supabase
      .from('threads')
      .select('id, source_message_id, highlighted_text')
      .eq('conversation_id', nextConversationId);

    if (threadsError) {
      console.error('Failed to load threads:', threadsError);
      setThreadsMap(new Map());
      return;
    }

    setThreadsMap(
      buildThreadsMap(
        (threadRows || []) as Array<{
          id: string;
          source_message_id: string;
          highlighted_text: string;
        }>
      )
    );
  }, []);

  return {
    messages,
    setMessages,
    conversationId,
    setConversationId,
    activeMentor,
    setActiveMentor,
    mentors,
    setMentors,
    conversations,
    loadingLists,
    listError,
    setListError,
    threadsMap,
    setThreadsMap,
    clearConversationState,
    refreshSidebarData,
    loadConversationMessages,
  };
}

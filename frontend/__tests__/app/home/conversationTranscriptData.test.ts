import { describe, expect, it } from 'vitest';
import {
  fetchCompleteMainTranscript,
  loadCompleteConversationTranscript,
  MAIN_TRANSCRIPT_PAGE_SIZE,
} from '@/app/home/components/conversationTranscriptData';
import { createMockSupabase } from '../../helpers/mock-supabase';

function createRow(index: number, previousMessageId: string | null) {
  const id = `message-${String(index).padStart(4, '0')}`;
  return {
    id,
    role: index % 2 === 0 ? 'assistant' : 'user',
    content: `Transcript message ${index}`,
    created_at: `2026-01-${String(Math.floor(index / 86_400) + 1).padStart(2, '0')}T${new Date(
      index * 1_000
    )
      .toISOString()
      .slice(11)}`,
    previous_message_id: previousMessageId,
    conversation_id: 'conversation-long',
    thread_id: null,
  } as const;
}

describe('fetchCompleteMainTranscript', () => {
  it('loads every page and preserves branch lineage beyond the old 200-row cap', async () => {
    const rows = Array.from({ length: 1_205 }, (_, offset) => {
      const index = offset + 1;
      const previousMessageId =
        index === 1
          ? null
          : index === 1_101
            ? 'message-0900'
            : `message-${String(index - 1).padStart(4, '0')}`;
      return createRow(index, previousMessageId);
    });
    const { client, tracker } = createMockSupabase({
      tables: {
        messages: { rows },
      },
    });

    const result = await fetchCompleteMainTranscript(
      client as unknown as Parameters<
        typeof fetchCompleteMainTranscript
      >[0],
      'conversation-long'
    );

    expect(result.isComplete).toBe(true);
    expect(result.rows).toHaveLength(rows.length);
    expect(result.rows[0].id).toBe('message-0001');
    expect(result.rows.at(-1)?.id).toBe('message-1205');
    expect(
      result.rows.find((row) => row.id === 'message-1101')
        ?.previous_message_id
    ).toBe('message-0900');
    expect(tracker.selects('messages')).toHaveLength(
      Math.ceil(rows.length / MAIN_TRANSCRIPT_PAGE_SIZE)
    );
  });

  it('rejects instead of returning a partial transcript when a page fails', async () => {
    const { client } = createMockSupabase({
      tables: {
        messages: {
          rows: [],
          queryError: { message: 'message page unavailable' },
        },
      },
    });

    await expect(
      fetchCompleteMainTranscript(
        client as unknown as Parameters<
          typeof fetchCompleteMainTranscript
        >[0],
        'conversation-long'
      )
    ).rejects.toMatchObject({
      name: 'TranscriptLoadError',
      reason: 'error',
    });
  });
});

describe('loadCompleteConversationTranscript', () => {
  it('builds the same message, branch, thread, and attachment model for server and browser callers', async () => {
    const root = createRow(1, null);
    const reply = createRow(2, root.id);
    const { client } = createMockSupabase({
      tables: {
        messages: { rows: [root, reply] },
        conversation_branches: {
          rows: [{
            id: 'branch-main',
            conversation_id: 'conversation-long',
            source_message_id: root.id,
            entry_message_id: reply.id,
            title: 'Main',
            is_main: true,
            position: 0,
          }],
        },
        threads: {
          rows: [{
            id: 'thread-1',
            conversation_id: 'conversation-long',
            source_message_id: reply.id,
            highlighted_text: 'Transcript',
            start_offset: 0,
            end_offset: 10,
            selection_stream_version: 'markdown-structure-v2',
          }],
        },
        message_attachments: {
          rows: [{
            id: 'attachment-1',
            message_id: reply.id,
            storage_path: 'user/conversation/image.png',
            file_name: 'image.png',
            mime_type: 'image/png',
            size_bytes: 128,
            width: 1,
            height: 1,
            position: 0,
          }],
        },
      },
    });

    const result = await loadCompleteConversationTranscript(
      client as unknown as Parameters<
        typeof loadCompleteConversationTranscript
      >[0],
      'conversation-long'
    );

    expect(result.messages[1].attachments).toEqual([{
      id: 'attachment-1',
      messageId: reply.id,
      storagePath: 'user/conversation/image.png',
      fileName: 'image.png',
      mimeType: 'image/png',
      sizeBytes: 128,
      width: 1,
      height: 1,
      url: '/api/chat/images/attachment-1',
    }]);
    expect(result.branches).toEqual([{
      id: 'branch-main',
      sourceMessageId: root.id,
      entryMessageId: reply.id,
      title: 'Main',
      isMain: true,
      position: 0,
    }]);
    expect(result.selectedBranchIds).toEqual({
      [root.id]: 'branch-main',
    });
    expect(result.threadsMap.get(reply.id)).toEqual([{
      threadId: 'thread-1',
      highlightedText: 'Transcript',
      sourceMessageId: reply.id,
      startOffset: 0,
      endOffset: 10,
      selectionStreamVersion: 'markdown-structure-v2',
    }]);
    expect(result.metadataStatus).toEqual({
      branches: { status: 'ready' },
      threads: { status: 'ready' },
      attachments: { status: 'ready' },
    });
  });

  it.each([
    ['conversation_branches', 'branches'],
    ['threads', 'threads'],
    ['message_attachments', 'attachments'],
  ] as const)(
    'preserves messages and reports %s metadata failures',
    async (failedTable, statusKey) => {
      const root = createRow(1, null);
      const { client } = createMockSupabase({
        tables: {
          messages: { rows: [root] },
          conversation_branches: {
            rows: [],
            ...(failedTable === 'conversation_branches'
              ? { queryError: { message: 'private backend detail' } }
              : {}),
          },
          threads: {
            rows: [],
            ...(failedTable === 'threads'
              ? { queryError: { message: 'private backend detail' } }
              : {}),
          },
          message_attachments: {
            rows: [],
            ...(failedTable === 'message_attachments'
              ? { queryError: { message: 'private backend detail' } }
              : {}),
          },
        },
      });

      const result = await loadCompleteConversationTranscript(
        client as unknown as Parameters<
          typeof loadCompleteConversationTranscript
        >[0],
        'conversation-long'
      );

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].content).toBe(root.content);
      expect(result.metadataStatus[statusKey]).toEqual({
        status: 'unavailable',
        reason: 'error',
      });
    }
  );

  it.each([
    ['conversation_branches', 'branches'],
    ['threads', 'threads'],
    ['message_attachments', 'attachments'],
  ] as const)(
    'times out %s independently without hiding messages',
    async (delayedTable, statusKey) => {
      const root = createRow(1, null);
      const { client } = createMockSupabase({
        tables: {
          messages: { rows: [root] },
          conversation_branches: {
            rows: [],
            ...(delayedTable === 'conversation_branches'
              ? { queryDelayMs: 20 }
              : {}),
          },
          threads: {
            rows: [],
            ...(delayedTable === 'threads' ? { queryDelayMs: 20 } : {}),
          },
          message_attachments: {
            rows: [],
            ...(delayedTable === 'message_attachments'
              ? { queryDelayMs: 20 }
              : {}),
          },
        },
      });

      const result = await loadCompleteConversationTranscript(
        client as unknown as Parameters<
          typeof loadCompleteConversationTranscript
        >[0],
        'conversation-long',
        { optionalMetadataTimeoutMs: 1 }
      );

      expect(result.messages).toHaveLength(1);
      expect(result.metadataStatus[statusKey]).toEqual({
        status: 'unavailable',
        reason: 'timeout',
      });
    }
  );
});

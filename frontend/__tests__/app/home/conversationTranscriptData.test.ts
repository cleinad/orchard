import { describe, expect, it } from 'vitest';
import {
  fetchCompleteMainTranscript,
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
    ).rejects.toThrow('message page unavailable');
  });
});

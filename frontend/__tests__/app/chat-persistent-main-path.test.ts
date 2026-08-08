import { describe, expect, it } from 'vitest';
import {
  fetchPersistentMainPathToMessage,
  MAX_PERSISTENT_MAIN_PATH_MESSAGES,
  PERSISTENT_MAIN_ANCHOR_WINDOW_MESSAGES,
} from '@/app/api/chat/persistentMainPath';
import { createMockSupabase } from '../helpers/mock-supabase';

const CONVERSATION_ID = 'conversation-long-path';

function createPathMessage(
  index: number,
  previousMessageId: string | null,
  createdAtSecond = index
) {
  return {
    id: `path-${String(index).padStart(4, '0')}`,
    role: index % 2 === 0 ? 'assistant' : 'user',
    content: `Path message ${index}`,
    previous_message_id: previousMessageId,
    created_at: new Date(
      Date.UTC(2026, 0, 1, 0, 0, createdAtSecond)
    ).toISOString(),
    search_metadata: null,
    conversation_id: CONVERSATION_ID,
    thread_id: null,
  } as const;
}

describe('fetchPersistentMainPathToMessage', () => {
  it('returns the final bounded path for a linear history beyond 200 messages', async () => {
    const rows = Array.from({ length: 250 }, (_, offset) => {
      const index = offset + 1;
      return createPathMessage(
        index,
        index === 1
          ? null
          : `path-${String(index - 1).padStart(4, '0')}`
      );
    });
    const { client, tracker } = createMockSupabase({
      tables: { messages: { rows } },
    });

    const path = await fetchPersistentMainPathToMessage(
      client as unknown as Parameters<
        typeof fetchPersistentMainPathToMessage
      >[0],
      CONVERSATION_ID,
      'path-0250'
    );

    expect(path).toHaveLength(MAX_PERSISTENT_MAIN_PATH_MESSAGES);
    expect(path[0].id).toBe('path-0201');
    expect(path.at(-1)?.id).toBe('path-0250');
    expect(tracker.selects('messages')).toHaveLength(2);
  });

  it('follows stored predecessors when interleaved branches displace the path window', async () => {
    const pathRows = Array.from({ length: 60 }, (_, offset) => {
      const index = offset + 1;
      return createPathMessage(
        index,
        index === 1
          ? null
          : `path-${String(index - 1).padStart(4, '0')}`,
        index === 60 ? 500 : index
      );
    });
    const siblingRows = Array.from({ length: 200 }, (_, offset) => ({
      id: `sibling-${String(offset + 1).padStart(4, '0')}`,
      role: 'assistant' as const,
      content: `Sibling message ${offset + 1}`,
      previous_message_id: null,
      created_at: new Date(
        Date.UTC(2026, 0, 1, 0, 1, offset)
      ).toISOString(),
      search_metadata: null,
      conversation_id: CONVERSATION_ID,
      thread_id: null,
    }));
    const { client, tracker } = createMockSupabase({
      tables: {
        messages: { rows: [...pathRows, ...siblingRows] },
      },
    });

    const path = await fetchPersistentMainPathToMessage(
      client as unknown as Parameters<
        typeof fetchPersistentMainPathToMessage
      >[0],
      CONVERSATION_ID,
      'path-0060'
    );

    expect(path).toHaveLength(MAX_PERSISTENT_MAIN_PATH_MESSAGES);
    expect(path[0].id).toBe('path-0011');
    expect(path.at(-1)?.id).toBe('path-0060');
    expect(path.map((message) => message.id)).not.toContain('sibling-0200');
    expect(tracker.selects('messages')).toHaveLength(2);
  });

  it('uses validated lineage ids for an old branch source beyond the chronological window', async () => {
    const pathRows = Array.from({ length: 60 }, (_, offset) => {
      const index = offset + 1;
      return createPathMessage(
        index,
        index === 1
          ? null
          : `path-${String(index - 1).padStart(4, '0')}`,
        index === 60 ? 2_000 : index
      );
    });
    const siblingRows = Array.from(
      { length: PERSISTENT_MAIN_ANCHOR_WINDOW_MESSAGES + 1 },
      (_, offset) => ({
        id: `dense-sibling-${String(offset + 1).padStart(4, '0')}`,
        role: 'assistant' as const,
        content: `Dense sibling message ${offset + 1}`,
        previous_message_id: null,
        created_at: new Date(
          Date.UTC(2026, 0, 1, 0, 1, offset)
        ).toISOString(),
        search_metadata: null,
        conversation_id: CONVERSATION_ID,
        thread_id: null,
      })
    );
    const branchMessage = {
      ...createPathMessage(
        2_001,
        'path-0060',
        2_001
      ),
      id: 'branch-user-message',
      content: 'Continue from the older selected path.',
    };
    const { client, tracker } = createMockSupabase({
      tables: {
        messages: { rows: [...pathRows, ...siblingRows, branchMessage] },
      },
    });

    const path = await fetchPersistentMainPathToMessage(
      client as unknown as Parameters<
        typeof fetchPersistentMainPathToMessage
      >[0],
      CONVERSATION_ID,
      branchMessage.id,
      pathRows.slice(-MAX_PERSISTENT_MAIN_PATH_MESSAGES).map((row) => row.id)
    );

    expect(path).toHaveLength(MAX_PERSISTENT_MAIN_PATH_MESSAGES);
    expect(path[0].id).toBe('path-0012');
    expect(path.at(-1)?.id).toBe(branchMessage.id);
    expect(tracker.selects('messages')).toHaveLength(2);
  });

  it('rejects instead of silently using partial context when predecessor reads fail', async () => {
    const { client } = createMockSupabase({
      tables: {
        messages: {
          rows: [],
          queryError: { message: 'history unavailable' },
        },
      },
    });

    await expect(
      fetchPersistentMainPathToMessage(
        client as unknown as Parameters<
          typeof fetchPersistentMainPathToMessage
        >[0],
        CONVERSATION_ID,
        'path-0250'
      )
    ).rejects.toThrow('history unavailable');
  });
});

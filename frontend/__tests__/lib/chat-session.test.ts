import { describe, expect, it } from 'vitest';
import {
  MAX_CHAT_HISTORY_MESSAGES,
  toChatHistoryMessageIds,
} from '@/lib/chat-session';

describe('toChatHistoryMessageIds', () => {
  it('follows the selected predecessor path instead of the newest display rows', () => {
    const selectedPath = Array.from({ length: 60 }, (_, offset) => {
      const index = offset + 1;
      return {
        id: `path-${index}`,
        previousMessageId: index === 1 ? null : `path-${index - 1}`,
      };
    });
    const newerSiblingRows = Array.from({ length: 600 }, (_, offset) => ({
      id: `sibling-${offset + 1}`,
      previousMessageId: null,
    }));

    const ids = toChatHistoryMessageIds(
      [...selectedPath, ...newerSiblingRows],
      'path-60'
    );

    expect(ids).toHaveLength(MAX_CHAT_HISTORY_MESSAGES);
    expect(ids[0]).toBe('path-11');
    expect(ids.at(-1)).toBe('path-60');
    expect(ids.some((id) => id.startsWith('sibling-'))).toBe(false);
  });
});

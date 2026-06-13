import type { PersistedSearchMetadata } from '@/lib/chat-search';
import { stripCitationMarkers } from '@/lib/search-citations';

export const CHAT_MODES = ['persistent', 'temporary'] as const;
export type ChatMode = (typeof CHAT_MODES)[number];

export const TEMPORARY_MEMORY_MODES = ['use_existing', 'off'] as const;
export type TemporaryMemoryMode = (typeof TEMPORARY_MEMORY_MODES)[number];

/** New temporary chats start with memory off unless the user opts into saved memories. */
export const DEFAULT_TEMPORARY_MEMORY_MODE: TemporaryMemoryMode = 'off';

export interface ChatHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export function toChatHistory(
  messages: Array<
    Pick<ChatHistoryMessage, 'role' | 'content'> & {
      searchMetadata?: PersistedSearchMetadata | null;
    }
  >
): ChatHistoryMessage[] {
  return messages.map((message) => ({
    role: message.role,
    content:
      message.role === 'assistant'
        ? stripCitationMarkers(message.content, message.searchMetadata)
        : message.content,
  }));
}

export function createTemporaryId(prefix: string): string {
  return `temp-${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function fallbackChatTitleFromMessage(
  message: string,
  emptyTitle = 'New chat'
): string {
  const normalized = message.replace(/\s+/g, ' ').trim();

  if (!normalized) {
    return emptyTitle;
  }

  if (normalized.length <= 60) {
    return normalized;
  }

  return `${normalized.slice(0, 57).trimEnd()}...`;
}

export function sanitizeGeneratedChatTitle(
  title: string | null | undefined,
  fallback: string
): string {
  const normalized = (title ?? '')
    .replace(/^["'\s]+|["'\s]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) {
    return fallback;
  }

  if (normalized.length <= 60) {
    return normalized;
  }

  return `${normalized.slice(0, 57).trimEnd()}...`;
}

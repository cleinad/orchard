import type { PersistedSearchMetadata } from '@/lib/chat-search';
import type { ChatImageAttachment, ChatImageAttachmentRequest } from '@/lib/chat-attachments';
import { stripCitationMarkers } from '@/lib/search-citations';

export const CHAT_MODES = ['persistent', 'temporary'] as const;
export type ChatMode = (typeof CHAT_MODES)[number];
export const MAX_CHAT_HISTORY_MESSAGES = 50;

export interface ChatHistoryMessage {
  id?: string | null;
  role: 'user' | 'assistant';
  content: string;
  attachments?: ChatImageAttachmentRequest[];
}

function toAttachmentRequests(
  attachments: ChatImageAttachment[] | undefined
): ChatImageAttachmentRequest[] {
  if (!attachments || attachments.length === 0) {
    return [];
  }

  return attachments.map((attachment) => ({
    storagePath: attachment.storagePath,
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    width: attachment.width,
    height: attachment.height,
  }));
}

export function toChatHistory(
  messages: Array<
    Pick<ChatHistoryMessage, 'role' | 'content'> & {
      attachments?: ChatImageAttachment[];
      searchMetadata?: PersistedSearchMetadata | null;
    }
  >
): ChatHistoryMessage[] {
  return messages.map((message) => {
    const attachments =
      message.role === 'user' ? toAttachmentRequests(message.attachments) : [];

    return {
      id: 'id' in message && typeof message.id === 'string' ? message.id : null,
      role: message.role,
      content:
        message.role === 'assistant'
          ? stripCitationMarkers(message.content, message.searchMetadata)
          : message.content,
      ...(attachments.length > 0 ? { attachments } : {}),
    };
  });
}

export function toChatHistoryMessageIds(
  messages: Array<{
    id?: string | null;
    previousMessageId?: string | null;
  }>,
  targetMessageId?: string | null
): string[] {
  if (targetMessageId) {
    const messagesById = new Map(
      messages
        .filter(
          (message): message is typeof message & { id: string } =>
            typeof message.id === 'string' && message.id.length > 0
        )
        .map((message) => [message.id, message])
    );
    const nearestFirst: string[] = [];
    const seen = new Set<string>();
    let currentId: string | null = targetMessageId;

    while (
      currentId
      && nearestFirst.length < MAX_CHAT_HISTORY_MESSAGES
      && !seen.has(currentId)
    ) {
      const message = messagesById.get(currentId);
      if (!message) break;
      seen.add(currentId);
      nearestFirst.push(currentId);
      currentId =
        typeof message.previousMessageId === 'string'
          ? message.previousMessageId
          : null;
    }

    return nearestFirst.reverse();
  }

  return Array.from(
    new Set(
      messages
        .map((message) => message.id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    )
  ).slice(-MAX_CHAT_HISTORY_MESSAGES);
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

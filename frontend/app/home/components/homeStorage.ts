import type { ThreadMessage } from '@/app/home/components/threadTypes';
import type { Message } from '@/app/home/types';

export interface StoredMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  attachments?: Message['attachments'];
  timestamp: string;
  searchMetadata?: Message['searchMetadata'];
  previousMessageId: string | null;
}

export interface StoredThreadMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  searchMetadata?: ThreadMessage['searchMetadata'];
}

export function toStoredMessage(message: Message): StoredMessage {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    attachments: message.attachments ?? [],
    timestamp: message.timestamp.toISOString(),
    searchMetadata: message.searchMetadata ?? null,
    previousMessageId: message.previousMessageId,
  };
}

export function fromStoredMessage(message: StoredMessage): Message {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    attachments: message.attachments ?? [],
    timestamp: new Date(message.timestamp),
    searchMetadata: message.searchMetadata ?? null,
    previousMessageId: message.previousMessageId ?? null,
  };
}

export function toStoredThreadMessage(message: ThreadMessage): StoredThreadMessage {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    timestamp: message.timestamp.toISOString(),
    searchMetadata: message.searchMetadata ?? null,
  };
}

export function fromStoredThreadMessage(message: StoredThreadMessage): ThreadMessage {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    timestamp: new Date(message.timestamp),
    searchMetadata: message.searchMetadata ?? null,
  };
}

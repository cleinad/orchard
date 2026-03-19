export const CHAT_MODES = ['persistent', 'temporary'] as const;
export type ChatMode = (typeof CHAT_MODES)[number];

export const TEMPORARY_MEMORY_MODES = ['use_existing', 'off'] as const;
export type TemporaryMemoryMode = (typeof TEMPORARY_MEMORY_MODES)[number];

export interface ChatHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export function toChatHistory(
  messages: Array<Pick<ChatHistoryMessage, 'role' | 'content'>>
): ChatHistoryMessage[] {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));
}

export function createTemporaryId(prefix: 'message' | 'thread'): string {
  return `temp-${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

import type { ChatModelProvider } from '@/lib/chat-models';

export const CHAT_IMAGE_BUCKET = 'chat-images';
export const MAX_CHAT_IMAGE_ATTACHMENTS = 5;
export const MAX_CHAT_IMAGE_BYTES = 10 * 1024 * 1024;
export const CHAT_IMAGE_SIGNED_URL_TTL_SECONDS = 60 * 60;

export const CHAT_IMAGE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
] as const;

export type ChatImageMimeType = (typeof CHAT_IMAGE_MIME_TYPES)[number];

interface ChatImageProviderLimits {
  maxAttachments: number;
  maxBytes: number;
  mimeTypes: readonly ChatImageMimeType[];
}

export const CHAT_IMAGE_PROVIDER_LIMITS: Record<ChatModelProvider, ChatImageProviderLimits> = {
  openai: {
    maxAttachments: MAX_CHAT_IMAGE_ATTACHMENTS,
    maxBytes: MAX_CHAT_IMAGE_BYTES,
    mimeTypes: CHAT_IMAGE_MIME_TYPES,
  },
  anthropic: {
    maxAttachments: MAX_CHAT_IMAGE_ATTACHMENTS,
    maxBytes: MAX_CHAT_IMAGE_BYTES,
    mimeTypes: CHAT_IMAGE_MIME_TYPES,
  },
  google: {
    maxAttachments: MAX_CHAT_IMAGE_ATTACHMENTS,
    maxBytes: MAX_CHAT_IMAGE_BYTES,
    mimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
  },
};

export interface ChatImageAttachment {
  id: string;
  messageId?: string | null;
  storagePath: string;
  fileName: string;
  mimeType: ChatImageMimeType;
  sizeBytes: number;
  width?: number | null;
  height?: number | null;
  url?: string | null;
}

export interface ChatImageAttachmentRequest {
  storagePath: string;
  fileName: string;
  mimeType: ChatImageMimeType;
  sizeBytes: number;
  width?: number | null;
  height?: number | null;
}

export function isChatImageMimeType(value: unknown): value is ChatImageMimeType {
  return typeof value === 'string' && CHAT_IMAGE_MIME_TYPES.includes(value as ChatImageMimeType);
}

export function sanitizeAttachmentFileName(fileName: string) {
  const normalized = fileName.replace(/\s+/g, ' ').trim();
  const safe = normalized.replace(/[^\w.\- ()]/g, '_').slice(0, 120);

  return safe || 'image';
}

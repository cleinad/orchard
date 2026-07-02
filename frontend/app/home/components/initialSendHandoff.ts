import {
  DEFAULT_CHAT_MODEL_ID,
  isChatModelEffortLevel,
  isChatModelId,
  type ChatModelEffortLevel,
  type ChatModelId,
} from '@/lib/chat-models';
import type { UploadedChatImageAttachment } from '@/app/home/components/chatImageUploads';
import {
  DEFAULT_RESPONSE_STYLE,
  sanitizeResponseStyle,
  type ResponseStyle,
} from '@/lib/response-style';
import { SEARCH_MODES, type SearchMode } from '@/lib/chat-search';
import { isChatImageMimeType } from '@/lib/chat-attachments';

const INITIAL_SEND_HANDOFF_STORAGE_KEY = 'keen-home-initial-send-handoff-v1';

export interface InitialSendHandoff {
  conversationId: string;
  workspaceId: string | null;
  mentorId: string | null;
  message: string;
  modelId: ChatModelId;
  modelEffort: ChatModelEffortLevel | null;
  thinkingEnabled: boolean | null;
  responseStyle: ResponseStyle;
  searchMode: SearchMode;
  uploadedAttachments: UploadedChatImageAttachment[];
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function normalizeNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function sanitizeSearchMode(value: unknown): SearchMode {
  if (typeof value === 'string' && SEARCH_MODES.includes(value as SearchMode)) {
    return value as SearchMode;
  }

  return 'auto';
}

function sanitizeUploadedAttachments(value: unknown): UploadedChatImageAttachment[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      return [];
    }

    const record = item as Record<string, unknown>;
    const id = typeof record.id === 'string' ? record.id.trim() : '';
    const storagePath =
      typeof record.storagePath === 'string' ? record.storagePath.trim() : '';
    const fileName = typeof record.fileName === 'string' ? record.fileName.trim() : '';
    const mimeType = record.mimeType;
    const sizeBytes = record.sizeBytes;
    const url = typeof record.url === 'string' ? record.url : '';

    if (
      !id
      || !storagePath
      || !fileName
      || !isChatImageMimeType(mimeType)
      || typeof sizeBytes !== 'number'
      || !Number.isFinite(sizeBytes)
      || sizeBytes <= 0
      || !url
    ) {
      return [];
    }

    return [{
      id,
      storagePath,
      fileName,
      mimeType,
      sizeBytes,
      width: normalizeNullableNumber(record.width),
      height: normalizeNullableNumber(record.height),
      url,
    }];
  });
}

export function persistInitialSendHandoff(handoff: InitialSendHandoff) {
  window.sessionStorage.setItem(
    INITIAL_SEND_HANDOFF_STORAGE_KEY,
    JSON.stringify(handoff)
  );
}

export function readInitialSendHandoff(conversationId: string): InitialSendHandoff | null {
  const stored = window.sessionStorage.getItem(INITIAL_SEND_HANDOFF_STORAGE_KEY);
  if (!stored) return null;

  try {
    const parsed = JSON.parse(stored) as Record<string, unknown>;
    if (
      !isNonEmptyString(parsed.conversationId) ||
      parsed.conversationId !== conversationId ||
      typeof parsed.message !== 'string'
    ) {
      return null;
    }

    const uploadedAttachments = sanitizeUploadedAttachments(parsed.uploadedAttachments);
    const message = parsed.message.trim();
    if (!message && uploadedAttachments.length === 0) {
      return null;
    }

    return {
      conversationId: parsed.conversationId,
      workspaceId: normalizeNullableString(parsed.workspaceId),
      mentorId: normalizeNullableString(parsed.mentorId),
      message,
      modelId: isChatModelId(parsed.modelId) ? parsed.modelId : DEFAULT_CHAT_MODEL_ID,
      modelEffort: isChatModelEffortLevel(parsed.modelEffort) ? parsed.modelEffort : null,
      thinkingEnabled:
        typeof parsed.thinkingEnabled === 'boolean' ? parsed.thinkingEnabled : null,
      responseStyle: parsed.responseStyle
        ? sanitizeResponseStyle(parsed.responseStyle)
        : DEFAULT_RESPONSE_STYLE,
      searchMode:
        parsed.searchMode === undefined && typeof parsed.searchEnabled === 'boolean'
          ? (parsed.searchEnabled ? 'required' : 'auto')
          : sanitizeSearchMode(parsed.searchMode),
      uploadedAttachments,
    };
  } catch {
    window.sessionStorage.removeItem(INITIAL_SEND_HANDOFF_STORAGE_KEY);
    return null;
  }
}

export function clearInitialSendHandoff() {
  window.sessionStorage.removeItem(INITIAL_SEND_HANDOFF_STORAGE_KEY);
}

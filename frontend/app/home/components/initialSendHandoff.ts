import {
  DEFAULT_CHAT_MODEL_ID,
  isChatModelEffortLevel,
  isChatModelId,
  type ChatModelEffortLevel,
  type ChatModelId,
} from '@/lib/chat-models';
import {
  DEFAULT_RESPONSE_STYLE,
  sanitizeResponseStyle,
  type ResponseStyle,
} from '@/lib/response-style';

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
  searchEnabled: boolean;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
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
      !isNonEmptyString(parsed.message)
    ) {
      return null;
    }

    return {
      conversationId: parsed.conversationId,
      workspaceId: normalizeNullableString(parsed.workspaceId),
      mentorId: normalizeNullableString(parsed.mentorId),
      message: parsed.message.trim(),
      modelId: isChatModelId(parsed.modelId) ? parsed.modelId : DEFAULT_CHAT_MODEL_ID,
      modelEffort: isChatModelEffortLevel(parsed.modelEffort) ? parsed.modelEffort : null,
      thinkingEnabled:
        typeof parsed.thinkingEnabled === 'boolean' ? parsed.thinkingEnabled : null,
      responseStyle: parsed.responseStyle
        ? sanitizeResponseStyle(parsed.responseStyle)
        : DEFAULT_RESPONSE_STYLE,
      searchEnabled: parsed.searchEnabled === true,
    };
  } catch {
    window.sessionStorage.removeItem(INITIAL_SEND_HANDOFF_STORAGE_KEY);
    return null;
  }
}

export function clearInitialSendHandoff() {
  window.sessionStorage.removeItem(INITIAL_SEND_HANDOFF_STORAGE_KEY);
}

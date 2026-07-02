import {
  isChatModelEffortLevel,
  isChatModelId,
  type ChatModelEffortOverrides,
  type ChatModelThinkingOverrides,
} from '@/lib/chat-models';

export const CHAT_MODEL_STORAGE_KEY = 'keen-chat-model';
export const CHAT_MODEL_EFFORT_OVERRIDES_STORAGE_KEY = 'keen-chat-model-effort-overrides-v1';
export const CHAT_MODEL_THINKING_OVERRIDES_STORAGE_KEY = 'keen-chat-thinking-overrides-v1';

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isChatModelEffortOverrides(
  value: unknown
): value is ChatModelEffortOverrides {
  if (!isPlainRecord(value)) {
    return false;
  }

  return Object.entries(value).every(
    ([modelId, effort]) =>
      isChatModelId(modelId)
      && typeof effort === 'string'
      && isChatModelEffortLevel(effort)
  );
}

export function isChatModelThinkingOverrides(
  value: unknown
): value is ChatModelThinkingOverrides {
  if (!isPlainRecord(value)) {
    return false;
  }

  return Object.entries(value).every(
    ([modelId, enabled]) => isChatModelId(modelId) && typeof enabled === 'boolean'
  );
}

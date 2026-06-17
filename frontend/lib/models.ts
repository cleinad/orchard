import { anthropic } from '@ai-sdk/anthropic';
import { google } from '@ai-sdk/google';
import { openai } from '@ai-sdk/openai';
import {
  CHAT_MODEL_OPTIONS,
  DEFAULT_CHAT_MODEL_ID,
  getChatModelOption,
  type ChatModelId,
  type ChatModelListItem,
  type ChatModelOption,
  type ResolvedChatModelSelection,
} from '@/lib/chat-models';
import type { BillingEntitlement } from '@/lib/billing';
import { isPaidChatModel } from '@/lib/billing-config';

export const MEMORY_MODEL = anthropic('claude-haiku-4-5-20251001');

function isModelConfigured(option: ChatModelOption) {
  return Boolean(process.env[option.envVar]);
}

function instantiateChatModel(option: ChatModelOption) {
  switch (option.provider) {
    case 'openai':
      return openai(option.apiModelId);
    case 'anthropic':
      return anthropic(option.apiModelId);
    case 'google':
      return google(option.apiModelId);
    default: {
      const exhaustiveCheck: never = option.provider;
      throw new Error(`Unsupported chat model provider: ${exhaustiveCheck}`);
    }
  }
}

export function getAvailableChatModelOptions() {
  return CHAT_MODEL_OPTIONS.filter(isModelConfigured);
}

export function getDefaultChatModelId(): ChatModelId | null {
  const preferredDefault = getChatModelOption(DEFAULT_CHAT_MODEL_ID);

  if (preferredDefault && isModelConfigured(preferredDefault)) {
    return preferredDefault.id;
  }

  return getAvailableChatModelOptions()[0]?.id ?? null;
}

export function getChatModelListItems(entitlement?: BillingEntitlement): ChatModelListItem[] {
  const defaultModelId = getDefaultChatModelId();

  return CHAT_MODEL_OPTIONS.map((option) => ({
    id: option.id,
    label: option.label,
    provider: option.provider,
    available:
      isModelConfigured(option)
      && (!isPaidChatModel(option.id) || Boolean(entitlement?.canUseCloudModels)),
    isDefault: option.id === defaultModelId,
    requiresPaidPlan: isPaidChatModel(option.id),
    unavailableReason:
      isPaidChatModel(option.id) && !entitlement?.canUseCloudModels
        ? 'Upgrade to use'
        : null,
  }));
}

export function resolveChatModelId(modelId?: string | null): ChatModelId | null {
  const requestedOption = getChatModelOption(modelId ?? null);
  if (requestedOption && isModelConfigured(requestedOption)) {
    return requestedOption.id;
  }

  return getDefaultChatModelId();
}

export function resolveChatModelSelection(
  modelId?: string | null
): ResolvedChatModelSelection | null {
  const resolvedModelId = resolveChatModelId(modelId);
  const option = getChatModelOption(resolvedModelId);

  if (!option) {
    return null;
  }

  return {
    id: option.id,
    label: option.label,
    provider: option.provider,
    apiModelId: option.apiModelId,
  };
}

export function getChatModel(modelId?: string | null) {
  const resolvedSelection = resolveChatModelSelection(modelId);

  if (!resolvedSelection) {
    throw new Error(
      'No chat model is configured. Set at least one of OPENAI_API_KEY, ANTHROPIC_API_KEY, or GOOGLE_GENERATIVE_AI_API_KEY.'
    );
  }

  const option = getChatModelOption(resolvedSelection.id);
  if (!option) {
    throw new Error(`Unknown chat model: ${resolvedSelection.id}`);
  }

  return instantiateChatModel(option);
}

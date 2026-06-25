import { anthropic } from '@ai-sdk/anthropic';
import { google } from '@ai-sdk/google';
import { createOpenAI, openai } from '@ai-sdk/openai';
import {
  CHAT_MODEL_OPTIONS,
  DEFAULT_CHAT_MODEL_ID,
  getChatModelOption,
  type ChatModelId,
  type ChatModelListItem,
  type ChatModelOption,
  type ResolvedChatModelSelection,
} from '@/lib/chat-models';

export const MEMORY_MODEL = anthropic('claude-haiku-4-5-20251001');
export const SEARCH_PLANNER_MODEL_ID =
  process.env.SEARCH_PLANNER_MODEL || 'Qwen/Qwen2.5-3B-Instruct';
export const QWEN_DECISION_MODEL_ID =
  process.env.QWEN_DECISION_MODEL || 'qwen2.5-3b-instruct';
export const QWEN_DECISION_BASE_URL =
  process.env.QWEN_BASE_URL
  || process.env.DASHSCOPE_BASE_URL
  || 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';

export type SearchDecisionProvider = 'qwen' | 'openrouter';

export interface SearchDecisionModelConfig {
  model: ReturnType<ReturnType<typeof createOpenAI>>;
  provider: SearchDecisionProvider;
  modelId: string;
}

export function getSearchPlannerModel() {
  const baseURL = process.env.SEARCH_PLANNER_BASE_URL;
  const apiKey = process.env.SEARCH_PLANNER_API_KEY;

  if (!baseURL || !apiKey) {
    return null;
  }

  return createOpenAI({ baseURL, apiKey })(SEARCH_PLANNER_MODEL_ID);
}

function getOpenRouterSearchDecisionModel(): SearchDecisionModelConfig | null {
  const model = getSearchPlannerModel();
  return model
    ? {
        model,
        provider: 'openrouter',
        modelId: SEARCH_PLANNER_MODEL_ID,
      }
    : null;
}

function getQwenSearchDecisionModel(): SearchDecisionModelConfig | null {
  const apiKey = process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY;

  if (!apiKey) {
    return null;
  }

  return {
    model: createOpenAI({
      baseURL: QWEN_DECISION_BASE_URL,
      apiKey,
    })(QWEN_DECISION_MODEL_ID),
    provider: 'qwen',
    modelId: QWEN_DECISION_MODEL_ID,
  };
}

export function getSearchDecisionModelConfig(): {
  primary: SearchDecisionModelConfig | null;
  fallback: SearchDecisionModelConfig | null;
} {
  const openRouter = getOpenRouterSearchDecisionModel();

  if (process.env.SEARCH_DECISION_PROVIDER === 'openrouter') {
    return {
      primary: openRouter,
      fallback: null,
    };
  }

  const qwen = getQwenSearchDecisionModel();

  return {
    primary: qwen ?? openRouter,
    fallback: qwen ? openRouter : null,
  };
}

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

export function getChatModelListItems(): ChatModelListItem[] {
  const defaultModelId = getDefaultChatModelId();

  return CHAT_MODEL_OPTIONS.map((option) => ({
    id: option.id,
    label: option.label,
    provider: option.provider,
    available: isModelConfigured(option),
    isDefault: option.id === defaultModelId,
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

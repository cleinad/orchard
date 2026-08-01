import { alibaba } from '@ai-sdk/alibaba';
import { anthropic } from '@ai-sdk/anthropic';
import { deepseek } from '@ai-sdk/deepseek';
import { google } from '@ai-sdk/google';
import { moonshotai } from '@ai-sdk/moonshotai';
import { createOpenAI, openai } from '@ai-sdk/openai';
import type { SharedV3ProviderOptions } from '@ai-sdk/provider';
import {
  CHAT_MODEL_OPTIONS,
  DEFAULT_CHAT_MODEL_ID,
  getChatModelOption,
  isConcreteChatModelOption,
  type ChatModelEffortLevel,
  type ChatModelId,
  type ChatModelListItem,
  type ChatModelOption,
  type ChatModelRuntimeOptions,
  type ConcreteChatModelId,
  type ResolvedChatModelSelection,
} from '@/lib/chat-models';

export const SEARCH_PLANNER_MODEL_ID =
  process.env.SEARCH_PLANNER_MODEL || 'deepseek/deepseek-v4-flash';
export const SEARCH_PLANNER_PROVIDER = 'openrouter';

type OpenAIProvider = ReturnType<typeof createOpenAI>;
type OpenAIChatModel = ReturnType<OpenAIProvider['chat']>;

export type SearchDecisionProvider = typeof SEARCH_PLANNER_PROVIDER;

export interface SearchDecisionModelConfig {
  model: OpenAIChatModel;
  provider: SearchDecisionProvider;
  modelId: string;
}

export function getSearchPlannerModel() {
  const baseURL = process.env.SEARCH_PLANNER_BASE_URL;
  const apiKey = process.env.SEARCH_PLANNER_API_KEY;

  if (!baseURL || !apiKey) {
    return null;
  }

  return createOpenAI({ baseURL, apiKey }).chat(SEARCH_PLANNER_MODEL_ID);
}

function getOpenRouterSearchDecisionModel(): SearchDecisionModelConfig | null {
  const model = getSearchPlannerModel();
  return model
    ? {
        model,
        provider: SEARCH_PLANNER_PROVIDER,
        modelId: SEARCH_PLANNER_MODEL_ID,
      }
    : null;
}

export function getSearchDecisionModelConfig(): {
  primary: SearchDecisionModelConfig | null;
  fallback: SearchDecisionModelConfig | null;
} {
  const openRouter = getOpenRouterSearchDecisionModel();

  return {
    primary: openRouter,
    fallback: null,
  };
}

type ProviderOptions = SharedV3ProviderOptions;

const NO_CHAT_MODEL_CONFIGURED_MESSAGE =
  'No chat model is configured. Set at least one chat provider API key.';

const ALIBABA_THINKING_BUDGETS: Record<ChatModelEffortLevel, number> = {
  minimal: 512,
  low: 1024,
  medium: 2048,
  high: 4096,
  max: 8192,
};

function isModelConfigured(option: ChatModelOption) {
  if (isConcreteChatModelOption(option)) {
    return Boolean(process.env[option.envVar]);
  }

  return Boolean(resolveAutoModelOption(option));
}

function resolveAutoModelOption(option: ChatModelOption) {
  for (const modelId of option.autoTargetIds ?? []) {
    const targetOption = getChatModelOption(modelId);
    if (targetOption && isConcreteChatModelOption(targetOption) && isModelConfigured(targetOption)) {
      return targetOption;
    }
  }

  return null;
}

function resolveConcreteModelOption(modelId?: string | null) {
  const requestedOption = getChatModelOption(modelId ?? null);

  if (requestedOption) {
    if (requestedOption.provider === 'auto') {
      const autoTarget = resolveAutoModelOption(requestedOption);
      if (autoTarget) {
        return {
          option: autoTarget,
          requestedId: requestedOption.id,
        };
      }
    } else if (isConcreteChatModelOption(requestedOption) && isModelConfigured(requestedOption)) {
      return {
        option: requestedOption,
        requestedId: requestedOption.id,
      };
    }
  }

  const preferredDefault = getChatModelOption(DEFAULT_CHAT_MODEL_ID);
  if (preferredDefault) {
    if (preferredDefault.provider === 'auto') {
      const autoTarget = resolveAutoModelOption(preferredDefault);
      if (autoTarget) {
        return {
          option: autoTarget,
          requestedId: preferredDefault.id,
        };
      }
    } else if (
      isConcreteChatModelOption(preferredDefault)
      && isModelConfigured(preferredDefault)
    ) {
      return {
        option: preferredDefault,
        requestedId: preferredDefault.id,
      };
    }
  }

  const firstConfiguredOption = CHAT_MODEL_OPTIONS.find(
    (option) => isConcreteChatModelOption(option) && isModelConfigured(option)
  );

  return firstConfiguredOption && isConcreteChatModelOption(firstConfiguredOption)
    ? {
        option: firstConfiguredOption,
        requestedId: firstConfiguredOption.id,
      }
    : null;
}

function instantiateChatModel(option: ResolvedChatModelSelection) {
  switch (option.provider) {
    case 'openai':
      return openai(option.apiModelId);
    case 'anthropic':
      return anthropic(option.apiModelId);
    case 'google':
      return google(option.apiModelId);
    case 'deepseek':
      return deepseek(option.apiModelId);
    case 'alibaba':
      return alibaba(option.apiModelId);
    case 'moonshot':
      return moonshotai(option.apiModelId);
    default: {
      const exhaustiveCheck: never = option.provider;
      throw new Error(`Unsupported chat model provider: ${exhaustiveCheck}`);
    }
  }
}

function normalizeEffort(
  option: ChatModelOption,
  runtimeOptions?: ChatModelRuntimeOptions | null
) {
  const effortConfig = option.effort;
  if (!effortConfig) {
    return null;
  }

  const requestedEffort = runtimeOptions?.effort ?? null;
  const effort =
    requestedEffort && effortConfig.levels.includes(requestedEffort)
      ? requestedEffort
      : effortConfig.defaultLevel;
  const thinkingEnabled =
    runtimeOptions?.thinkingEnabled ?? effortConfig.defaultThinkingEnabled;

  return {
    effort,
    thinkingEnabled,
  };
}

function mapOpenAiReasoningEffort(
  effort: ChatModelEffortLevel,
  thinkingEnabled: boolean,
  option: ChatModelOption
) {
  if (!thinkingEnabled && option.id === 'gpt-5.5') {
    return 'none';
  }

  return effort === 'max' ? 'xhigh' : effort;
}

function getProviderOptionsForModel(
  option: ChatModelOption,
  runtimeOptions?: ChatModelRuntimeOptions | null
): ProviderOptions | undefined {
  if (!isConcreteChatModelOption(option)) {
    return undefined;
  }

  const normalized = normalizeEffort(option, runtimeOptions);
  if (!normalized) {
    return undefined;
  }

  const { effort, thinkingEnabled } = normalized;

  switch (option.provider) {
    case 'openai':
      return {
        openai: {
          reasoningEffort: mapOpenAiReasoningEffort(effort, thinkingEnabled, option),
        },
      };
    case 'anthropic':
      return {
        anthropic: {
          effort,
          ...(thinkingEnabled ? { thinking: { type: 'adaptive' } } : {}),
        },
      };
    case 'google':
      return {
        google: {
          thinkingConfig: {
            thinkingLevel: effort === 'max' ? 'high' : effort,
            includeThoughts: true,
          },
        },
      };
    case 'deepseek':
      return {
        deepseek: {
          thinking: { type: thinkingEnabled ? 'enabled' : 'disabled' },
          ...(thinkingEnabled
            ? {
                reasoningEffort:
                  effort === 'minimal' ? 'low' : effort === 'max' ? 'max' : effort,
              }
            : {}),
        },
      };
    case 'alibaba':
      return {
        alibaba: {
          enableThinking: thinkingEnabled,
          ...(thinkingEnabled ? { thinkingBudget: ALIBABA_THINKING_BUDGETS[effort] } : {}),
        },
      };
    case 'moonshot':
      return undefined;
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

  return CHAT_MODEL_OPTIONS.map((option) => {
    const autoTarget =
      option.provider === 'auto' ? resolveAutoModelOption(option) : null;

    return {
      id: option.id,
      label: option.label,
      provider: option.provider,
      providerLabel: option.providerLabel,
      iconKey: option.iconKey,
      description: option.description,
      ...(option.badge ? { badge: option.badge } : {}),
      available: isModelConfigured(option),
      isDefault: option.id === defaultModelId,
      ...(autoTarget ? { resolvedModelId: autoTarget.id } : {}),
      ...(option.effort ? { effort: option.effort } : {}),
      supportsImages: isConcreteChatModelOption(option) ? option.supportsImages : false,
    };
  });
}

export function resolveChatModelId(modelId?: string | null): ConcreteChatModelId | null {
  return resolveConcreteModelOption(modelId)?.option.id ?? null;
}

export function resolveChatModelSelection(
  modelId?: string | null
): ResolvedChatModelSelection | null {
  const resolved = resolveConcreteModelOption(modelId);
  if (!resolved) {
    return null;
  }

  const { option, requestedId } = resolved;

  return {
    id: option.id,
    requestedId,
    label: option.label,
    provider: option.provider,
    providerLabel: option.providerLabel,
    apiModelId: option.apiModelId,
    ...(option.effort ? { effort: option.effort } : {}),
    supportsImages: option.supportsImages,
  };
}

export function getChatModel(modelId?: string | null) {
  const resolvedSelection = resolveChatModelSelection(modelId);

  if (!resolvedSelection) {
    throw new Error(NO_CHAT_MODEL_CONFIGURED_MESSAGE);
  }

  return instantiateChatModel(resolvedSelection);
}

export function getChatModelProviderOptions(
  modelId?: string | null,
  runtimeOptions?: ChatModelRuntimeOptions | null
) {
  const resolved = resolveConcreteModelOption(modelId);

  if (!resolved) {
    return undefined;
  }

  return getProviderOptionsForModel(resolved.option, runtimeOptions);
}

export function getNoChatModelConfiguredMessage() {
  return NO_CHAT_MODEL_CONFIGURED_MESSAGE;
}

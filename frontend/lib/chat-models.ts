export type ConcreteChatModelProvider =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'deepseek';

export type ChatModelProvider = 'auto' | ConcreteChatModelProvider;

export type ChatModelId =
  | 'auto'
  | 'gpt-5.6-sol'
  | 'gpt-5.6-terra'
  | 'gpt-5.6-luna'
  | 'claude-sonnet-5'
  | 'claude-opus-5'
  | 'gemini-3.1-pro-preview'
  | 'gemini-3.6-flash'
  | 'deepseek-v4-pro';

export type ConcreteChatModelId = Exclude<ChatModelId, 'auto'>;

export type ChatModelEnvVar =
  | 'OPENAI_API_KEY'
  | 'ANTHROPIC_API_KEY'
  | 'GOOGLE_GENERATIVE_AI_API_KEY'
  | 'DEEPSEEK_API_KEY';

export type ChatModelEffortLevel =
  | 'minimal'
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh'
  | 'max';

export type ChatModelEffortOverrides = Partial<
  Record<ChatModelId, ChatModelEffortLevel>
>;

export type ChatModelThinkingOverrides = Partial<Record<ChatModelId, boolean>>;

export interface ChatModelEffortConfig {
  levels: readonly ChatModelEffortLevel[];
  defaultLevel: ChatModelEffortLevel;
  supportsThinkingToggle: boolean;
  defaultThinkingEnabled: boolean;
  thinkingDisableUnsupportedLevels?: readonly ChatModelEffortLevel[];
}

export interface ChatModelOption {
  id: ChatModelId;
  label: string;
  provider: ChatModelProvider;
  providerLabel: string;
  iconKey: ChatModelProvider;
  description: string;
  apiModelId?: string;
  envVar?: ChatModelEnvVar;
  autoTargetIds?: readonly ConcreteChatModelId[];
  autoImageTargetIds?: readonly ConcreteChatModelId[];
  effort?: ChatModelEffortConfig;
  supportsImages?: boolean;
}

export interface ChatModelListItem {
  id: ChatModelId;
  label: string;
  provider: ChatModelProvider;
  providerLabel: string;
  iconKey: ChatModelProvider;
  description: string;
  available: boolean;
  isDefault: boolean;
  resolvedModelId?: ConcreteChatModelId;
  effort?: ChatModelEffortConfig;
  supportsImages: boolean;
}

export interface ResolvedChatModelSelection {
  id: ConcreteChatModelId;
  requestedId: ChatModelId;
  label: string;
  provider: ConcreteChatModelProvider;
  providerLabel: string;
  apiModelId: string;
  effort?: ChatModelEffortConfig;
  supportsImages: boolean;
}

export interface ChatModelRuntimeOptions {
  effort?: ChatModelEffortLevel | null;
  thinkingEnabled?: boolean | null;
}

export const DEFAULT_CHAT_MODEL_ID: ChatModelId = 'auto';

const STANDARD_REASONING_LEVELS = ['low', 'medium', 'high', 'max'] as const;
const FRONTIER_REASONING_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
const ANTHROPIC_REASONING_LEVELS = ['low', 'medium', 'high', 'max'] as const;
const GOOGLE_PRO_REASONING_LEVELS = ['low', 'medium', 'high'] as const;
const GOOGLE_FLASH_REASONING_LEVELS = ['minimal', 'low', 'medium', 'high'] as const;

export const CHAT_MODEL_OPTIONS: readonly ChatModelOption[] = [
  {
    id: 'auto',
    label: 'Auto',
    provider: 'auto',
    providerLabel: 'Auto',
    iconKey: 'auto',
    description:
      'Uses DeepSeek V4 Pro, or Gemini 3.6 Flash with GPT-5.6 Terra fallback for image context.',
    autoTargetIds: ['deepseek-v4-pro'],
    autoImageTargetIds: ['gemini-3.6-flash', 'gpt-5.6-terra'],
    supportsImages: true,
  },
  {
    id: 'gpt-5.6-sol',
    label: 'GPT-5.6 Sol',
    provider: 'openai',
    providerLabel: 'OpenAI',
    iconKey: 'openai',
    description: 'Flagship OpenAI model for complex professional work.',
    apiModelId: 'gpt-5.6-sol',
    envVar: 'OPENAI_API_KEY',
    supportsImages: true,
    effort: {
      levels: FRONTIER_REASONING_LEVELS,
      defaultLevel: 'medium',
      supportsThinkingToggle: true,
      defaultThinkingEnabled: true,
    },
  },
  {
    id: 'gpt-5.6-terra',
    label: 'GPT-5.6 Terra',
    provider: 'openai',
    providerLabel: 'OpenAI',
    iconKey: 'openai',
    description: 'Balanced OpenAI model for intelligence and cost.',
    apiModelId: 'gpt-5.6-terra',
    envVar: 'OPENAI_API_KEY',
    supportsImages: true,
    effort: {
      levels: FRONTIER_REASONING_LEVELS,
      defaultLevel: 'medium',
      supportsThinkingToggle: true,
      defaultThinkingEnabled: true,
    },
  },
  {
    id: 'gpt-5.6-luna',
    label: 'GPT-5.6 Luna',
    provider: 'openai',
    providerLabel: 'OpenAI',
    iconKey: 'openai',
    description: 'Efficient OpenAI model for high-volume workloads.',
    apiModelId: 'gpt-5.6-luna',
    envVar: 'OPENAI_API_KEY',
    supportsImages: true,
    effort: {
      levels: FRONTIER_REASONING_LEVELS,
      defaultLevel: 'medium',
      supportsThinkingToggle: true,
      defaultThinkingEnabled: true,
    },
  },
  {
    id: 'gemini-3.1-pro-preview',
    label: 'Gemini 3.1 Pro',
    provider: 'google',
    providerLabel: 'Google',
    iconKey: 'google',
    description: 'Strong Gemini reasoning model for complex multimodal work.',
    apiModelId: 'gemini-3.1-pro-preview',
    envVar: 'GOOGLE_GENERATIVE_AI_API_KEY',
    supportsImages: true,
    effort: {
      levels: GOOGLE_PRO_REASONING_LEVELS,
      defaultLevel: 'medium',
      supportsThinkingToggle: false,
      defaultThinkingEnabled: true,
    },
  },
  {
    id: 'claude-sonnet-5',
    label: 'Claude Sonnet 5',
    provider: 'anthropic',
    providerLabel: 'Anthropic',
    iconKey: 'anthropic',
    description: 'Fast Claude model balancing intelligence and cost.',
    apiModelId: 'claude-sonnet-5',
    envVar: 'ANTHROPIC_API_KEY',
    supportsImages: true,
    effort: {
      levels: ANTHROPIC_REASONING_LEVELS,
      defaultLevel: 'high',
      supportsThinkingToggle: true,
      defaultThinkingEnabled: true,
    },
  },
  {
    id: 'claude-opus-5',
    label: 'Claude Opus 5',
    provider: 'anthropic',
    providerLabel: 'Anthropic',
    iconKey: 'anthropic',
    description: 'Claude model for complex agentic coding and enterprise work.',
    apiModelId: 'claude-opus-5',
    envVar: 'ANTHROPIC_API_KEY',
    supportsImages: true,
    effort: {
      levels: ANTHROPIC_REASONING_LEVELS,
      defaultLevel: 'high',
      supportsThinkingToggle: true,
      defaultThinkingEnabled: true,
      thinkingDisableUnsupportedLevels: ['max'],
    },
  },
  {
    id: 'gemini-3.6-flash',
    label: 'Gemini 3.6 Flash',
    provider: 'google',
    providerLabel: 'Google',
    iconKey: 'google',
    description: 'Fast multimodal Gemini model for image context and advanced work.',
    apiModelId: 'gemini-3.6-flash',
    envVar: 'GOOGLE_GENERATIVE_AI_API_KEY',
    supportsImages: true,
    effort: {
      levels: GOOGLE_FLASH_REASONING_LEVELS,
      defaultLevel: 'medium',
      supportsThinkingToggle: false,
      defaultThinkingEnabled: true,
    },
  },
  {
    id: 'deepseek-v4-pro',
    label: 'DeepSeek V4 Pro',
    provider: 'deepseek',
    providerLabel: 'DeepSeek',
    iconKey: 'deepseek',
    description: 'Stronger DeepSeek model for difficult reasoning and coding.',
    apiModelId: 'deepseek-v4-pro',
    envVar: 'DEEPSEEK_API_KEY',
    supportsImages: false,
    effort: {
      levels: STANDARD_REASONING_LEVELS,
      defaultLevel: 'high',
      supportsThinkingToggle: true,
      defaultThinkingEnabled: true,
    },
  },
] as const;

export function isChatModelId(value: unknown): value is ChatModelId {
  return CHAT_MODEL_OPTIONS.some((option) => option.id === value);
}

export function isChatModelEffortLevel(value: unknown): value is ChatModelEffortLevel {
  return (
    value === 'minimal' ||
    value === 'low' ||
    value === 'medium' ||
    value === 'high' ||
    value === 'xhigh' ||
    value === 'max'
  );
}

export function getChatModelOption(
  modelId: string | null | undefined
): ChatModelOption | null {
  if (!modelId) {
    return null;
  }

  return CHAT_MODEL_OPTIONS.find((option) => option.id === modelId) ?? null;
}

export function isConcreteChatModelOption(
  option: ChatModelOption
): option is ChatModelOption & {
  id: ConcreteChatModelId;
  provider: ConcreteChatModelProvider;
  apiModelId: string;
  envVar: ChatModelEnvVar;
  supportsImages: boolean;
} {
  return option.provider !== 'auto' && Boolean(option.apiModelId && option.envVar);
}

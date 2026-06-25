export type ConcreteChatModelProvider =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'deepseek'
  | 'alibaba'
  | 'moonshot';

export type ChatModelProvider = 'auto' | ConcreteChatModelProvider;

export type ChatModelId =
  | 'auto'
  | 'gpt-5.5'
  | 'gpt-5.4'
  | 'claude-sonnet-4-6'
  | 'claude-opus-4-8'
  | 'gemini-3.1-pro-preview'
  | 'gemini-3-flash-preview'
  | 'deepseek-v4-flash'
  | 'deepseek-v4-pro'
  | 'qwen3.7-plus'
  | 'kimi-k2.7-code';

export type ConcreteChatModelId = Exclude<ChatModelId, 'auto'>;

export type ChatModelEnvVar =
  | 'OPENAI_API_KEY'
  | 'ANTHROPIC_API_KEY'
  | 'GOOGLE_GENERATIVE_AI_API_KEY'
  | 'DEEPSEEK_API_KEY'
  | 'ALIBABA_API_KEY'
  | 'MOONSHOT_API_KEY';

export type ChatModelEffortLevel =
  | 'minimal'
  | 'low'
  | 'medium'
  | 'high'
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
}

export interface ChatModelOption {
  id: ChatModelId;
  label: string;
  provider: ChatModelProvider;
  providerLabel: string;
  iconKey: ChatModelProvider;
  description: string;
  badge?: 'Max';
  apiModelId?: string;
  envVar?: ChatModelEnvVar;
  autoTargetIds?: readonly ConcreteChatModelId[];
  effort?: ChatModelEffortConfig;
}

export interface ChatModelListItem {
  id: ChatModelId;
  label: string;
  provider: ChatModelProvider;
  providerLabel: string;
  iconKey: ChatModelProvider;
  description: string;
  badge?: 'Max';
  available: boolean;
  isDefault: boolean;
  resolvedModelId?: ConcreteChatModelId;
  effort?: ChatModelEffortConfig;
}

export interface ResolvedChatModelSelection {
  id: ConcreteChatModelId;
  requestedId: ChatModelId;
  label: string;
  provider: ConcreteChatModelProvider;
  providerLabel: string;
  apiModelId: string;
  effort?: ChatModelEffortConfig;
}

export interface ChatModelRuntimeOptions {
  effort?: ChatModelEffortLevel | null;
  thinkingEnabled?: boolean | null;
}

export const DEFAULT_CHAT_MODEL_ID: ChatModelId = 'auto';

const STANDARD_REASONING_LEVELS = ['low', 'medium', 'high', 'max'] as const;
const GOOGLE_PRO_REASONING_LEVELS = ['low', 'medium', 'high'] as const;
const GOOGLE_FLASH_REASONING_LEVELS = ['minimal', 'low', 'medium', 'high'] as const;
const CHINESE_AUTO_TARGETS = [
  'deepseek-v4-flash',
  'qwen3.7-plus',
  'kimi-k2.7-code',
  'deepseek-v4-pro',
] as const;

export const CHAT_MODEL_OPTIONS: readonly ChatModelOption[] = [
  {
    id: 'auto',
    label: 'Auto',
    provider: 'auto',
    providerLabel: 'Auto',
    iconKey: 'auto',
    description: 'Routes to the best configured Chinese provider first.',
    autoTargetIds: CHINESE_AUTO_TARGETS,
  },
  {
    id: 'gpt-5.5',
    label: 'GPT-5.5',
    provider: 'openai',
    providerLabel: 'OpenAI',
    iconKey: 'openai',
    description: 'Best OpenAI model for complex reasoning and coding.',
    badge: 'Max',
    apiModelId: 'gpt-5.5',
    envVar: 'OPENAI_API_KEY',
    effort: {
      levels: STANDARD_REASONING_LEVELS,
      defaultLevel: 'medium',
      supportsThinkingToggle: true,
      defaultThinkingEnabled: true,
    },
  },
  {
    id: 'gpt-5.4',
    label: 'GPT-5.4',
    provider: 'openai',
    providerLabel: 'OpenAI',
    iconKey: 'openai',
    description: 'Balanced OpenAI option for everyday paid usage.',
    apiModelId: 'gpt-5.4',
    envVar: 'OPENAI_API_KEY',
    effort: {
      levels: ['low', 'medium', 'high'],
      defaultLevel: 'medium',
      supportsThinkingToggle: false,
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
    effort: {
      levels: GOOGLE_PRO_REASONING_LEVELS,
      defaultLevel: 'medium',
      supportsThinkingToggle: false,
      defaultThinkingEnabled: true,
    },
  },
  {
    id: 'claude-sonnet-4-6',
    label: 'Claude Sonnet 4.6',
    provider: 'anthropic',
    providerLabel: 'Anthropic',
    iconKey: 'anthropic',
    description: 'Efficient Claude model for everyday research and coding.',
    apiModelId: 'claude-sonnet-4-6',
    envVar: 'ANTHROPIC_API_KEY',
    effort: {
      levels: STANDARD_REASONING_LEVELS,
      defaultLevel: 'medium',
      supportsThinkingToggle: true,
      defaultThinkingEnabled: true,
    },
  },
  {
    id: 'claude-opus-4-8',
    label: 'Claude Opus 4.8',
    provider: 'anthropic',
    providerLabel: 'Anthropic',
    iconKey: 'anthropic',
    description: 'Premium Claude model for high-stakes coding and analysis.',
    badge: 'Max',
    apiModelId: 'claude-opus-4-8',
    envVar: 'ANTHROPIC_API_KEY',
    effort: {
      levels: STANDARD_REASONING_LEVELS,
      defaultLevel: 'high',
      supportsThinkingToggle: true,
      defaultThinkingEnabled: true,
    },
  },
  {
    id: 'gemini-3-flash-preview',
    label: 'Gemini 3 Flash',
    provider: 'google',
    providerLabel: 'Google',
    iconKey: 'google',
    description: 'Fast Gemini 3 model with broad thinking-level support.',
    apiModelId: 'gemini-3-flash-preview',
    envVar: 'GOOGLE_GENERATIVE_AI_API_KEY',
    effort: {
      levels: GOOGLE_FLASH_REASONING_LEVELS,
      defaultLevel: 'medium',
      supportsThinkingToggle: false,
      defaultThinkingEnabled: true,
    },
  },
  {
    id: 'deepseek-v4-flash',
    label: 'DeepSeek V4 Flash',
    provider: 'deepseek',
    providerLabel: 'DeepSeek',
    iconKey: 'deepseek',
    description: 'Fast Chinese reasoning model and the first Auto target.',
    apiModelId: 'deepseek-v4-flash',
    envVar: 'DEEPSEEK_API_KEY',
    effort: {
      levels: STANDARD_REASONING_LEVELS,
      defaultLevel: 'high',
      supportsThinkingToggle: true,
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
    badge: 'Max',
    apiModelId: 'deepseek-v4-pro',
    envVar: 'DEEPSEEK_API_KEY',
    effort: {
      levels: STANDARD_REASONING_LEVELS,
      defaultLevel: 'high',
      supportsThinkingToggle: true,
      defaultThinkingEnabled: true,
    },
  },
  {
    id: 'qwen3.7-plus',
    label: 'Qwen 3.7 Plus',
    provider: 'alibaba',
    providerLabel: 'Alibaba',
    iconKey: 'alibaba',
    description: 'General-purpose Qwen option with optional thinking budget.',
    apiModelId: 'qwen3.7-plus',
    envVar: 'ALIBABA_API_KEY',
    effort: {
      levels: STANDARD_REASONING_LEVELS,
      defaultLevel: 'medium',
      supportsThinkingToggle: true,
      defaultThinkingEnabled: true,
    },
  },
  {
    id: 'kimi-k2.7-code',
    label: 'Kimi K2.7 Code',
    provider: 'moonshot',
    providerLabel: 'Moonshot',
    iconKey: 'moonshot',
    description: 'Code-focused Kimi model with thinking always enabled.',
    badge: 'Max',
    apiModelId: 'kimi-k2.7-code',
    envVar: 'MOONSHOT_API_KEY',
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
} {
  return option.provider !== 'auto' && Boolean(option.apiModelId && option.envVar);
}

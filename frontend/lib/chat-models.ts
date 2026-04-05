export type ChatModelProvider = 'openai' | 'anthropic' | 'google';

export type ChatModelId =
  | 'gpt-5.4'
  | 'claude-sonnet-4-6'
  | 'gemini-3-flash-preview';

export interface ChatModelOption {
  id: ChatModelId;
  label: string;
  provider: ChatModelProvider;
  apiModelId: string;
  envVar: 'OPENAI_API_KEY' | 'ANTHROPIC_API_KEY' | 'GOOGLE_GENERATIVE_AI_API_KEY';
}

export interface ChatModelListItem {
  id: ChatModelId;
  label: string;
  provider: ChatModelProvider;
  available: boolean;
  isDefault: boolean;
}

export const DEFAULT_CHAT_MODEL_ID: ChatModelId = 'gemini-3-flash-preview';

export const CHAT_MODEL_OPTIONS: readonly ChatModelOption[] = [
  {
    id: 'gpt-5.4',
    label: 'GPT 5.4',
    provider: 'openai',
    apiModelId: 'gpt-5.4',
    envVar: 'OPENAI_API_KEY',
  },
  {
    id: 'claude-sonnet-4-6',
    label: 'Sonnet 4.6',
    provider: 'anthropic',
    apiModelId: 'claude-sonnet-4-6',
    envVar: 'ANTHROPIC_API_KEY',
  },
  {
    id: 'gemini-3-flash-preview',
    label: 'Gemini 3',
    provider: 'google',
    apiModelId: 'gemini-3-flash-preview',
    envVar: 'GOOGLE_GENERATIVE_AI_API_KEY',
  },
] as const;

export function isChatModelId(value: unknown): value is ChatModelId {
  return CHAT_MODEL_OPTIONS.some((option) => option.id === value);
}

export function getChatModelOption(
  modelId: string | null | undefined
): ChatModelOption | null {
  if (!modelId) {
    return null;
  }

  return CHAT_MODEL_OPTIONS.find((option) => option.id === modelId) ?? null;
}

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const openaiMock = vi.fn((modelId: string) => ({ provider: 'openai', modelId }));
const anthropicMock = vi.fn((modelId: string) => ({ provider: 'anthropic', modelId }));
const googleMock = vi.fn((modelId: string) => ({ provider: 'google', modelId }));

vi.mock('@ai-sdk/openai', () => ({
  openai: openaiMock,
}));

vi.mock('@ai-sdk/anthropic', () => ({
  anthropic: anthropicMock,
}));

vi.mock('@ai-sdk/google', () => ({
  google: googleMock,
}));

describe('chat model resolver', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('marks configured providers as available', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-openai-key');

    const { getChatModelListItems } = await import('@/lib/models');
    const items = getChatModelListItems();

    expect(items).toEqual([
      {
        id: 'gpt-5.4',
        label: 'GPT 5.4',
        provider: 'openai',
        available: true,
        isDefault: true,
      },
      {
        id: 'claude-sonnet-4-6',
        label: 'Sonnet 4.6',
        provider: 'anthropic',
        available: false,
        isDefault: false,
      },
      {
        id: 'gemini-3-flash-preview',
        label: 'Gemini 3',
        provider: 'google',
        available: false,
        isDefault: false,
      },
    ]);
  });

  it('resolves the requested configured model', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-openai-key');
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-anthropic-key');
    vi.stubEnv('GOOGLE_GENERATIVE_AI_API_KEY', 'test-google-key');

    const { resolveChatModelSelection } = await import('@/lib/models');

    expect(resolveChatModelSelection('claude-sonnet-4-6')).toEqual({
      id: 'claude-sonnet-4-6',
      label: 'Sonnet 4.6',
      provider: 'anthropic',
      apiModelId: 'claude-sonnet-4-6',
    });
  });

  it('falls back to the default available model when the requested one is unavailable', async () => {
    vi.stubEnv('GOOGLE_GENERATIVE_AI_API_KEY', 'test-google-key');

    const { resolveChatModelSelection } = await import('@/lib/models');

    expect(resolveChatModelSelection('gpt-5.4')).toEqual({
      id: 'gemini-3-flash-preview',
      label: 'Gemini 3',
      provider: 'google',
      apiModelId: 'gemini-3-flash-preview',
    });
  });

  it('instantiates the resolved provider model', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-anthropic-key');

    const { getChatModel } = await import('@/lib/models');
    const model = getChatModel('claude-sonnet-4-6');

    expect(anthropicMock).toHaveBeenCalledWith('claude-sonnet-4-6');
    expect(model).toEqual({
      provider: 'anthropic',
      modelId: 'claude-sonnet-4-6',
    });
  });

  it('throws when no chat model providers are configured', async () => {
    const { getChatModel, resolveChatModelSelection } = await import('@/lib/models');

    expect(resolveChatModelSelection('gpt-5.4')).toBeNull();
    expect(() => getChatModel('gpt-5.4')).toThrow(
      'No chat model is configured. Set at least one of OPENAI_API_KEY, ANTHROPIC_API_KEY, or GOOGLE_GENERATIVE_AI_API_KEY.'
    );
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const openaiMock = vi.fn((modelId: string) => ({ provider: 'openai', modelId }));
const anthropicMock = vi.fn((modelId: string) => ({ provider: 'anthropic', modelId }));
const googleMock = vi.fn((modelId: string) => ({ provider: 'google', modelId }));
const deepseekMock = vi.fn((modelId: string) => ({ provider: 'deepseek', modelId }));

vi.mock('@ai-sdk/openai', () => ({
  openai: openaiMock,
}));

vi.mock('@ai-sdk/anthropic', () => ({
  anthropic: anthropicMock,
}));

vi.mock('@ai-sdk/google', () => ({
  google: googleMock,
}));

vi.mock('@ai-sdk/deepseek', () => ({
  deepseek: deepseekMock,
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

  it('marks configured providers as available and exposes picker metadata', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-openai-key');

    const { getChatModelListItems } = await import('@/lib/models');
    const items = getChatModelListItems();

    expect(items[0]).toEqual(
      expect.objectContaining({
        id: 'auto',
        provider: 'auto',
        available: false,
        isDefault: false,
        supportsImages: true,
      })
    );
    expect(items.find((item) => item.id === 'gpt-5.6-sol')).toEqual(
      expect.objectContaining({
        label: 'GPT-5.6 Sol',
        provider: 'openai',
        providerLabel: 'OpenAI',
        iconKey: 'openai',
        available: true,
        isDefault: true,
        supportsImages: true,
      })
    );
    expect(items.find((item) => item.id === 'claude-sonnet-5')).toEqual(
      expect.objectContaining({
        label: 'Claude Sonnet 5',
        provider: 'anthropic',
        available: false,
        isDefault: false,
        supportsImages: true,
      })
    );
    expect(items.find((item) => item.id === 'gemini-3.6-flash')).toEqual(
      expect.objectContaining({
        label: 'Gemini 3.6 Flash',
        provider: 'google',
        available: false,
        isDefault: false,
        supportsImages: true,
      })
    );
  });

  it('resolves auto text requests to DeepSeek V4 Pro', async () => {
    vi.stubEnv('DEEPSEEK_API_KEY', 'test-deepseek-key');
    vi.stubEnv('GOOGLE_GENERATIVE_AI_API_KEY', 'test-google-key');

    const { resolveChatModelSelection } = await import('@/lib/models');

    expect(resolveChatModelSelection('auto')).toEqual(
      expect.objectContaining({
        id: 'deepseek-v4-pro',
        requestedId: 'auto',
        provider: 'deepseek',
        apiModelId: 'deepseek-v4-pro',
      })
    );
  });

  it('resolves auto image context to Gemini 3.6 Flash', async () => {
    vi.stubEnv('DEEPSEEK_API_KEY', 'test-deepseek-key');
    vi.stubEnv('GOOGLE_GENERATIVE_AI_API_KEY', 'test-google-key');
    vi.stubEnv('OPENAI_API_KEY', 'test-openai-key');

    const { resolveChatModelSelection } = await import('@/lib/models');

    expect(resolveChatModelSelection('auto', { hasImageContext: true })).toEqual(
      expect.objectContaining({
        id: 'gemini-3.6-flash',
        requestedId: 'auto',
        provider: 'google',
        apiModelId: 'gemini-3.6-flash',
      })
    );
  });

  it('falls back to GPT-5.6 Terra for auto image context without Google', async () => {
    vi.stubEnv('DEEPSEEK_API_KEY', 'test-deepseek-key');
    vi.stubEnv('OPENAI_API_KEY', 'test-openai-key');

    const { getChatModelListItems, resolveChatModelSelection } =
      await import('@/lib/models');

    expect(resolveChatModelSelection('auto', { hasImageContext: true })).toEqual(
      expect.objectContaining({
        id: 'gpt-5.6-terra',
        requestedId: 'auto',
        provider: 'openai',
        apiModelId: 'gpt-5.6-terra',
      })
    );
    expect(getChatModelListItems().find((item) => item.id === 'auto')).toEqual(
      expect.objectContaining({
        available: true,
        supportsImages: true,
      })
    );
  });

  it('does not send auto image context to a text-only fallback', async () => {
    vi.stubEnv('DEEPSEEK_API_KEY', 'test-deepseek-key');

    const { getChatModelListItems, resolveChatModelSelection } =
      await import('@/lib/models');

    expect(resolveChatModelSelection('auto', { hasImageContext: true })).toBeNull();
    expect(getChatModelListItems().find((item) => item.id === 'auto')).toEqual(
      expect.objectContaining({
        available: true,
        supportsImages: false,
      })
    );
  });

  it('resolves the requested configured model', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-openai-key');
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-anthropic-key');
    vi.stubEnv('GOOGLE_GENERATIVE_AI_API_KEY', 'test-google-key');

    const { resolveChatModelSelection } = await import('@/lib/models');

    expect(resolveChatModelSelection('claude-sonnet-5')).toEqual(
      expect.objectContaining({
        id: 'claude-sonnet-5',
        requestedId: 'claude-sonnet-5',
        label: 'Claude Sonnet 5',
        provider: 'anthropic',
        apiModelId: 'claude-sonnet-5',
        supportsImages: true,
      })
    );
  });

  it('falls back to the default available model when the requested one is unavailable', async () => {
    vi.stubEnv('GOOGLE_GENERATIVE_AI_API_KEY', 'test-google-key');

    const { resolveChatModelSelection } = await import('@/lib/models');

    expect(resolveChatModelSelection('gpt-5.5')).toEqual(
      expect.objectContaining({
        id: 'gemini-3.1-pro-preview',
        label: 'Gemini 3.1 Pro',
        provider: 'google',
        apiModelId: 'gemini-3.1-pro-preview',
        supportsImages: true,
      })
    );
  });

  it('instantiates the resolved provider model', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-anthropic-key');

    const { getChatModel } = await import('@/lib/models');
    const model = getChatModel('claude-opus-5');

    expect(anthropicMock).toHaveBeenCalledWith('claude-opus-5');
    expect(model).toEqual({
      provider: 'anthropic',
      modelId: 'claude-opus-5',
    });
  });

  it('maps provider-specific effort options', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-openai-key');
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-anthropic-key');
    vi.stubEnv('GOOGLE_GENERATIVE_AI_API_KEY', 'test-google-key');
    vi.stubEnv('DEEPSEEK_API_KEY', 'test-deepseek-key');

    const { getChatModelProviderOptions } = await import('@/lib/models');

    expect(
      getChatModelProviderOptions('gpt-5.6-sol', {
        effort: 'max',
        thinkingEnabled: true,
      })
    ).toEqual({ openai: { reasoningEffort: 'max' } });
    expect(
      getChatModelProviderOptions('claude-sonnet-5', {
        effort: 'low',
        thinkingEnabled: true,
      })
    ).toEqual({ anthropic: { effort: 'low', thinking: { type: 'adaptive' } } });
    expect(
      getChatModelProviderOptions('claude-sonnet-5', {
        effort: 'xhigh',
        thinkingEnabled: true,
      })
    ).toEqual({ anthropic: { effort: 'high', thinking: { type: 'adaptive' } } });
    expect(
      getChatModelProviderOptions('gemini-3.1-pro-preview', {
        effort: 'max',
        thinkingEnabled: true,
      })
    ).toEqual({
      google: {
        thinkingConfig: {
          thinkingLevel: 'medium',
          includeThoughts: true,
        },
      },
    });
    expect(
      getChatModelProviderOptions('deepseek-v4-pro', {
        effort: 'max',
        thinkingEnabled: true,
      })
    ).toEqual({
      deepseek: {
        thinking: { type: 'enabled' },
        reasoningEffort: 'max',
      },
    });
  });

  it('can disable thinking where the provider supports a toggle', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-openai-key');
    vi.stubEnv('DEEPSEEK_API_KEY', 'test-deepseek-key');

    const { getChatModelProviderOptions } = await import('@/lib/models');

    expect(
      getChatModelProviderOptions('gpt-5.6-sol', {
        effort: 'high',
        thinkingEnabled: false,
      })
    ).toEqual({ openai: { reasoningEffort: 'none' } });
    expect(
      getChatModelProviderOptions('deepseek-v4-pro', {
        effort: 'high',
        thinkingEnabled: false,
      })
    ).toEqual({ deepseek: { thinking: { type: 'disabled' } } });
  });

  it('throws when no chat model providers are configured', async () => {
    const { getChatModel, resolveChatModelSelection } = await import('@/lib/models');

    expect(resolveChatModelSelection('gpt-5.6-sol')).toBeNull();
    expect(() => getChatModel('gpt-5.6-sol')).toThrow(
      'No chat model is configured. Set at least one chat provider API key.'
    );
  });
});

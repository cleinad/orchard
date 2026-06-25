import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const openaiMock = vi.fn((modelId: string) => ({ provider: 'openai', modelId }));
const anthropicMock = vi.fn((modelId: string) => ({ provider: 'anthropic', modelId }));
const googleMock = vi.fn((modelId: string) => ({ provider: 'google', modelId }));
const deepseekMock = vi.fn((modelId: string) => ({ provider: 'deepseek', modelId }));
const alibabaMock = vi.fn((modelId: string) => ({ provider: 'alibaba', modelId }));
const moonshotMock = vi.fn((modelId: string) => ({ provider: 'moonshot', modelId }));

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

vi.mock('@ai-sdk/alibaba', () => ({
  alibaba: alibabaMock,
}));

vi.mock('@ai-sdk/moonshotai', () => ({
  moonshotai: moonshotMock,
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
      })
    );
    expect(items.find((item) => item.id === 'gpt-5.5')).toEqual(
      expect.objectContaining({
        label: 'GPT-5.5',
        provider: 'openai',
        providerLabel: 'OpenAI',
        iconKey: 'openai',
        badge: 'Max',
        available: true,
        isDefault: true,
      })
    );
    expect(items.find((item) => item.id === 'claude-sonnet-4-6')).toEqual(
      expect.objectContaining({
        available: false,
        isDefault: false,
      })
    );
  });

  it('resolves auto to the first configured Chinese provider', async () => {
    vi.stubEnv('DEEPSEEK_API_KEY', 'test-deepseek-key');
    vi.stubEnv('ALIBABA_API_KEY', 'test-alibaba-key');

    const { resolveChatModelSelection } = await import('@/lib/models');

    expect(resolveChatModelSelection('auto')).toEqual(
      expect.objectContaining({
        id: 'deepseek-v4-flash',
        requestedId: 'auto',
        provider: 'deepseek',
        apiModelId: 'deepseek-v4-flash',
      })
    );
  });

  it('falls back through auto targets when the first Chinese provider is unavailable', async () => {
    vi.stubEnv('ALIBABA_API_KEY', 'test-alibaba-key');

    const { resolveChatModelSelection } = await import('@/lib/models');

    expect(resolveChatModelSelection('auto')).toEqual(
      expect.objectContaining({
        id: 'qwen3.7-plus',
        requestedId: 'auto',
        provider: 'alibaba',
      })
    );
  });

  it('resolves the requested configured model', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-openai-key');
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-anthropic-key');
    vi.stubEnv('GOOGLE_GENERATIVE_AI_API_KEY', 'test-google-key');

    const { resolveChatModelSelection } = await import('@/lib/models');

    expect(resolveChatModelSelection('claude-sonnet-4-6')).toEqual(
      expect.objectContaining({
        id: 'claude-sonnet-4-6',
        requestedId: 'claude-sonnet-4-6',
        label: 'Claude Sonnet 4.6',
        provider: 'anthropic',
        apiModelId: 'claude-sonnet-4-6',
      })
    );
  });

  it('falls back to the default available model when the requested one is unavailable', async () => {
    vi.stubEnv('GOOGLE_GENERATIVE_AI_API_KEY', 'test-google-key');

    const { resolveChatModelSelection } = await import('@/lib/models');

    expect(resolveChatModelSelection('gpt-5.5')).toEqual(
      expect.objectContaining({
        id: 'gemini-3.1-pro-preview',
        provider: 'google',
        apiModelId: 'gemini-3.1-pro-preview',
      })
    );
  });

  it('instantiates the resolved provider model', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-anthropic-key');

    const { getChatModel } = await import('@/lib/models');
    const model = getChatModel('claude-opus-4-8');

    expect(anthropicMock).toHaveBeenCalledWith('claude-opus-4-8');
    expect(model).toEqual({
      provider: 'anthropic',
      modelId: 'claude-opus-4-8',
    });
  });

  it('maps provider-specific effort options', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-openai-key');
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-anthropic-key');
    vi.stubEnv('GOOGLE_GENERATIVE_AI_API_KEY', 'test-google-key');
    vi.stubEnv('DEEPSEEK_API_KEY', 'test-deepseek-key');
    vi.stubEnv('ALIBABA_API_KEY', 'test-alibaba-key');
    vi.stubEnv('MOONSHOT_API_KEY', 'test-moonshot-key');

    const { getChatModelProviderOptions } = await import('@/lib/models');

    expect(
      getChatModelProviderOptions('gpt-5.5', {
        effort: 'max',
        thinkingEnabled: true,
      })
    ).toEqual({ openai: { reasoningEffort: 'xhigh' } });
    expect(
      getChatModelProviderOptions('claude-sonnet-4-6', {
        effort: 'low',
        thinkingEnabled: true,
      })
    ).toEqual({ anthropic: { effort: 'low', thinking: { type: 'adaptive' } } });
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
      getChatModelProviderOptions('deepseek-v4-flash', {
        effort: 'max',
        thinkingEnabled: true,
      })
    ).toEqual({
      deepseek: {
        thinking: { type: 'enabled' },
        reasoningEffort: 'max',
      },
    });
    expect(
      getChatModelProviderOptions('qwen3.7-plus', {
        effort: 'high',
        thinkingEnabled: true,
      })
    ).toEqual({
      alibaba: {
        enableThinking: true,
        thinkingBudget: 4096,
      },
    });
    expect(getChatModelProviderOptions('kimi-k2.7-code')).toBeUndefined();
  });

  it('can disable thinking where the provider supports a toggle', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-openai-key');
    vi.stubEnv('DEEPSEEK_API_KEY', 'test-deepseek-key');
    vi.stubEnv('ALIBABA_API_KEY', 'test-alibaba-key');

    const { getChatModelProviderOptions } = await import('@/lib/models');

    expect(
      getChatModelProviderOptions('gpt-5.5', {
        effort: 'high',
        thinkingEnabled: false,
      })
    ).toEqual({ openai: { reasoningEffort: 'none' } });
    expect(
      getChatModelProviderOptions('deepseek-v4-flash', {
        effort: 'high',
        thinkingEnabled: false,
      })
    ).toEqual({ deepseek: { thinking: { type: 'disabled' } } });
    expect(
      getChatModelProviderOptions('qwen3.7-plus', {
        effort: 'high',
        thinkingEnabled: false,
      })
    ).toEqual({ alibaba: { enableThinking: false } });
  });

  it('throws when no chat model providers are configured', async () => {
    const { getChatModel, resolveChatModelSelection } = await import('@/lib/models');

    expect(resolveChatModelSelection('gpt-5.5')).toBeNull();
    expect(() => getChatModel('gpt-5.5')).toThrow(
      'No chat model is configured. Set at least one chat provider API key.'
    );
  });
});

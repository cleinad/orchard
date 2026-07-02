import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@ai-sdk/anthropic', () => ({
  anthropic: vi.fn((modelId: string) => ({ provider: 'anthropic', modelId })),
}));

vi.mock('@ai-sdk/google', () => ({
  google: vi.fn((modelId: string) => ({ provider: 'google', modelId })),
}));

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn((options: Record<string, string>) =>
    Object.assign(
      vi.fn((modelId: string) => ({ api: 'responses', modelId, options })),
      {
        chat: vi.fn((modelId: string) => ({ api: 'chat', modelId, options })),
      }
    )
  ),
  openai: vi.fn((modelId: string) => ({ provider: 'openai', modelId })),
}));

async function loadModels() {
  vi.resetModules();
  return import('@/lib/models');
}

describe('search decision model config', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('uses openrouter chat completions for the planner model', async () => {
    vi.stubEnv('SEARCH_PLANNER_API_KEY', 'openrouter-key');
    vi.stubEnv('SEARCH_PLANNER_BASE_URL', 'https://openrouter.ai/api/v1');
    vi.stubEnv('SEARCH_PLANNER_MODEL', 'qwen/qwen-2.5-7b-instruct');

    const { getSearchPlannerModel } = await loadModels();
    const model = getSearchPlannerModel();

    expect(model).toEqual({
      api: 'chat',
      modelId: 'qwen/qwen-2.5-7b-instruct',
      options: {
        apiKey: 'openrouter-key',
        baseURL: 'https://openrouter.ai/api/v1',
      },
    });
  });

  it('uses openrouter as the decision model and ignores alibaba env vars', async () => {
    vi.stubEnv('ALIBABA_API_KEY', 'alibaba-key');
    vi.stubEnv('ALIBABA_DECISION_MODEL', 'qwen2.5-7b-instruct');
    vi.stubEnv('SEARCH_PLANNER_API_KEY', 'openrouter-key');
    vi.stubEnv('SEARCH_PLANNER_BASE_URL', 'https://openrouter.ai/api/v1');
    vi.stubEnv('SEARCH_PLANNER_MODEL', 'qwen/qwen-2.5-7b-instruct');

    const { getSearchDecisionModelConfig } = await loadModels();
    const config = getSearchDecisionModelConfig();

    expect(config.primary).toMatchObject({
      provider: 'openrouter',
      modelId: 'qwen/qwen-2.5-7b-instruct',
    });
    expect(config.primary?.model).toMatchObject({
      api: 'chat',
      modelId: 'qwen/qwen-2.5-7b-instruct',
    });
    expect(config.fallback).toBeNull();
  });

  it('defaults to the lightweight openrouter qwen model', async () => {
    vi.stubEnv('SEARCH_PLANNER_API_KEY', 'openrouter-key');
    vi.stubEnv('SEARCH_PLANNER_BASE_URL', 'https://openrouter.ai/api/v1');

    const { SEARCH_PLANNER_MODEL_ID, getSearchDecisionModelConfig } = await loadModels();
    const config = getSearchDecisionModelConfig();

    expect(SEARCH_PLANNER_MODEL_ID).toBe('qwen/qwen-2.5-7b-instruct');
    expect(config.primary).toMatchObject({
      provider: 'openrouter',
      modelId: 'qwen/qwen-2.5-7b-instruct',
    });
  });
});

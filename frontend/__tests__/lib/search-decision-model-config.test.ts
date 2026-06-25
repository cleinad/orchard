import { beforeEach, describe, expect, it, vi } from 'vitest';

async function loadModels() {
  vi.resetModules();
  return import('@/lib/models');
}

describe('search decision model config', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses alibaba direct as the primary decision model and openrouter as fallback when both are configured', async () => {
    vi.stubEnv('ALIBABA_API_KEY', 'alibaba-key');
    vi.stubEnv('ALIBABA_DECISION_MODEL', 'qwen2.5-3b-instruct');
    vi.stubEnv('SEARCH_PLANNER_API_KEY', 'openrouter-key');
    vi.stubEnv('SEARCH_PLANNER_BASE_URL', 'https://openrouter.ai/api/v1');
    vi.stubEnv('SEARCH_PLANNER_MODEL', 'Qwen/Qwen2.5-3B-Instruct');

    const { getSearchDecisionModelConfig } = await loadModels();
    const config = getSearchDecisionModelConfig();

    expect(config.primary).toMatchObject({
      provider: 'alibaba',
      modelId: 'qwen2.5-3b-instruct',
    });
    expect(config.fallback).toMatchObject({
      provider: 'openrouter',
      modelId: 'Qwen/Qwen2.5-3B-Instruct',
    });
  });

  it('keeps openrouter as primary when alibaba is not configured', async () => {
    vi.stubEnv('SEARCH_PLANNER_API_KEY', 'openrouter-key');
    vi.stubEnv('SEARCH_PLANNER_BASE_URL', 'https://openrouter.ai/api/v1');
    vi.stubEnv('SEARCH_PLANNER_MODEL', 'Qwen/Qwen2.5-3B-Instruct');

    const { getSearchDecisionModelConfig } = await loadModels();
    const config = getSearchDecisionModelConfig();

    expect(config.primary).toMatchObject({
      provider: 'openrouter',
      modelId: 'Qwen/Qwen2.5-3B-Instruct',
    });
    expect(config.fallback).toBeNull();
  });

  it('can force openrouter even when alibaba is configured', async () => {
    vi.stubEnv('SEARCH_DECISION_PROVIDER', 'openrouter');
    vi.stubEnv('ALIBABA_API_KEY', 'alibaba-key');
    vi.stubEnv('SEARCH_PLANNER_API_KEY', 'openrouter-key');
    vi.stubEnv('SEARCH_PLANNER_BASE_URL', 'https://openrouter.ai/api/v1');
    vi.stubEnv('SEARCH_PLANNER_MODEL', 'Qwen/Qwen2.5-3B-Instruct');

    const { getSearchDecisionModelConfig } = await loadModels();
    const config = getSearchDecisionModelConfig();

    expect(config.primary).toMatchObject({
      provider: 'openrouter',
      modelId: 'Qwen/Qwen2.5-3B-Instruct',
    });
    expect(config.fallback).toBeNull();
  });
});

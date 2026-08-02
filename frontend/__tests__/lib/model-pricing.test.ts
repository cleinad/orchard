import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  calculateModelCost,
  formatNanousdAsUsd,
  getCatalogPricingCoverage,
  MODEL_PRICE_REGISTRY,
} from '@/lib/telemetry/model-pricing';

describe('model pricing', () => {
  it('prices uncached, cached, and output tokens with integer nano-USD arithmetic', () => {
    expect(calculateModelCost({
      provider: 'openai',
      providerModelId: 'gpt-5.5',
      startedAt: new Date('2026-07-31T00:00:00Z'),
      usage: {
        inputTokens: 1_000,
        noCacheInputTokens: 900,
        cacheReadTokens: 100,
        outputTokens: 500,
        reasoningTokens: 400,
        totalTokens: 1_500,
      },
    })).toEqual({
      status: 'priced',
      estimatedCostNanousd: BigInt(19_550_000),
      pricingVersion: 'openai-2026-07-31',
    });
  });

  it('rounds once at the final nano-USD boundary', () => {
    expect(calculateModelCost({
      provider: 'deepseek',
      providerModelId: 'deepseek-v4-flash',
      startedAt: new Date('2026-07-31T00:00:00Z'),
      usage: {
        inputTokens: 1,
        noCacheInputTokens: 0,
        cacheReadTokens: 1,
        outputTokens: 0,
      },
    })).toEqual({
      status: 'priced',
      estimatedCostNanousd: BigInt(3),
      pricingVersion: 'deepseek-2026-07-31',
    });
  });

  it('prices the OpenRouter search planner under its routed model identifier', () => {
    expect(calculateModelCost({
      provider: 'openrouter',
      providerModelId: 'deepseek/deepseek-v4-flash',
      startedAt: new Date('2026-08-01T00:00:00Z'),
      usage: {
        inputTokens: 1_000,
        noCacheInputTokens: 1_000,
        outputTokens: 100,
      },
    })).toEqual({
      status: 'priced',
      estimatedCostNanousd: BigInt(107_520),
      pricingVersion: 'openrouter-2026-08-01',
    });
  });

  it('does not double-charge reasoning included in provider output totals', () => {
    expect(calculateModelCost({
      provider: 'google',
      providerModelId: 'gemini-3.6-flash',
      startedAt: new Date('2026-07-31T00:00:00Z'),
      usage: {
        inputTokens: 0,
        noCacheInputTokens: 0,
        outputTokens: 100,
        reasoningTokens: 80,
      },
    })).toEqual(expect.objectContaining({
      status: 'priced',
      estimatedCostNanousd: BigInt(750_000),
    }));
  });

  it('selects long-context tiers and effective versions deterministically', () => {
    expect(calculateModelCost({
      provider: 'google',
      providerModelId: 'gemini-3.1-pro-preview',
      startedAt: new Date('2026-07-31T00:00:00Z'),
      usage: {
        inputTokens: 200_001,
        noCacheInputTokens: 200_001,
        outputTokens: 1,
      },
    })).toEqual(expect.objectContaining({
      status: 'priced',
      pricingVersion: 'google-2026-07-31',
    }));

    expect(calculateModelCost({
      provider: 'google',
      providerModelId: 'gemini-3.1-pro-preview',
      startedAt: new Date('2026-02-18T00:00:00Z'),
      usage: { inputTokens: 1, outputTokens: 1 },
    }).status).toBe('missing_price');
  });

  it('keeps missing usage and missing prices distinct from zero', () => {
    expect(calculateModelCost({
      provider: 'openai',
      providerModelId: 'gpt-5.5',
      startedAt: new Date('2026-07-31T00:00:00Z'),
      usage: {},
    })).toEqual({
      status: 'missing_usage',
      estimatedCostNanousd: null,
      pricingVersion: null,
    });

    expect(calculateModelCost({
      provider: 'openrouter',
      providerModelId: 'runtime-planner',
      startedAt: new Date('2026-07-31T00:00:00Z'),
      usage: { inputTokens: 10, outputTokens: 10 },
    })).toEqual({
      status: 'missing_price',
      estimatedCostNanousd: null,
      pricingVersion: null,
    });
  });

  it('refuses to price an incomplete input-token partition', () => {
    expect(calculateModelCost({
      provider: 'openai',
      providerModelId: 'gpt-5.5',
      startedAt: new Date('2026-07-31T00:00:00Z'),
      usage: {
        inputTokens: 100,
        noCacheInputTokens: 20,
        cacheReadTokens: 30,
        cacheWriteTokens: 10,
        outputTokens: 10,
      },
    }).status).toBe('missing_price');
  });

  it('links OpenAI rates to exact official model documentation', () => {
    expect(MODEL_PRICE_REGISTRY['openai:gpt-5.6-sol'].prices[0].sourceUrl)
      .toBe('https://developers.openai.com/api/docs/models/gpt-5.6-sol');
    expect(MODEL_PRICE_REGISTRY['openai:gpt-5.6-terra'].prices[0].sourceUrl)
      .toBe('https://developers.openai.com/api/docs/models/gpt-5.6-terra');
    expect(MODEL_PRICE_REGISTRY['openai:gpt-5.6-luna'].prices[0].sourceUrl)
      .toBe('https://developers.openai.com/api/docs/models/gpt-5.6-luna');
  });

  it('covers every configured catalog model as priced or deliberately unpriced', () => {
    const coverage = getCatalogPricingCoverage();
    expect(coverage).toHaveLength(8);
    expect(coverage.every((entry) => entry.covered)).toBe(true);
    expect(coverage.every((entry) => entry.priced)).toBe(true);
  });

  it('formats nano-USD without floating point conversion', () => {
    expect(formatNanousdAsUsd(BigInt(19_550_000))).toBe('0.01955');
    expect(formatNanousdAsUsd(BigInt(1_234_567_890), 6)).toBe('1.234567');
    expect(formatNanousdAsUsd(BigInt(0))).toBe('0');
  });
});

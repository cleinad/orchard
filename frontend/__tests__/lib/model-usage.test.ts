import { describe, expect, it, vi } from 'vitest';
import type { LanguageModelUsage } from 'ai';

vi.mock('server-only', () => ({}));

import {
  normalizeModelUsage,
  sanitizeFinishReason,
} from '@/lib/telemetry/model-usage';

function usage(overrides: Partial<LanguageModelUsage> = {}): LanguageModelUsage {
  return {
    inputTokens: 120,
    inputTokenDetails: {
      noCacheTokens: 90,
      cacheReadTokens: 20,
      cacheWriteTokens: 10,
    },
    outputTokens: 40,
    outputTokenDetails: {
      textTokens: 30,
      reasoningTokens: 10,
    },
    totalTokens: 160,
    ...overrides,
  };
}

describe('model usage normalization', () => {
  it('copies only approved scalar usage fields', () => {
    expect(normalizeModelUsage(usage({ raw: { secret: 'not persisted' } }))).toEqual({
      inputTokens: 120,
      noCacheInputTokens: 90,
      cacheReadTokens: 20,
      cacheWriteTokens: 10,
      outputTokens: 40,
      reasoningTokens: 10,
      totalTokens: 160,
    });
  });

  it('derives uncached input from the inclusive AI SDK total', () => {
    expect(normalizeModelUsage(usage({
      inputTokens: 100,
      inputTokenDetails: {
        noCacheTokens: undefined,
        cacheReadTokens: 30,
        cacheWriteTokens: 10,
      },
    })).noCacheInputTokens).toBe(60);
  });

  it('preserves missing usage as missing', () => {
    expect(normalizeModelUsage(undefined)).toEqual({});
    expect(normalizeModelUsage(usage({
      inputTokens: undefined,
      inputTokenDetails: {
        noCacheTokens: undefined,
        cacheReadTokens: undefined,
        cacheWriteTokens: undefined,
      },
      outputTokens: undefined,
      outputTokenDetails: { textTokens: undefined, reasoningTokens: undefined },
      totalTokens: undefined,
    }))).toEqual({});
  });

  it('rejects negative, fractional, and inconsistent usage', () => {
    expect(() => normalizeModelUsage(usage({ inputTokens: -1 }))).toThrow();
    expect(() => normalizeModelUsage(usage({ outputTokens: 1.5 }))).toThrow();
    expect(() => normalizeModelUsage(usage({
      outputTokens: 5,
      outputTokenDetails: { textTokens: 0, reasoningTokens: 6 },
    }))).toThrow();
    expect(() => normalizeModelUsage(usage({
      inputTokens: 10,
      inputTokenDetails: {
        noCacheTokens: 0,
        cacheReadTokens: 8,
        cacheWriteTokens: 3,
      },
    }))).toThrow();
    expect(() => normalizeModelUsage(usage({
      inputTokens: 100,
      inputTokenDetails: {
        noCacheTokens: 20,
        cacheReadTokens: 30,
        cacheWriteTokens: 10,
      },
    }))).toThrow();
  });

  it('keeps only unified finish reasons', () => {
    expect(sanitizeFinishReason('stop')).toBe('stop');
    expect(sanitizeFinishReason('provider_secret_reason')).toBeUndefined();
    expect(sanitizeFinishReason({ raw: true })).toBeUndefined();
  });
});

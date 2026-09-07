import 'server-only';

import type { LanguageModelUsage } from 'ai';

export interface NormalizedModelUsage {
  inputTokens?: number;
  noCacheInputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  totalTokens?: number;
}

const FINISH_REASONS = new Set([
  'stop',
  'length',
  'content-filter',
  'tool-calls',
  'error',
  'other',
  'unknown',
]);

function validateTokenCount(name: string, value: number | undefined) {
  if (value === undefined) return;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`Invalid ${name} token count`);
  }
}

export function normalizeModelUsage(
  usage: LanguageModelUsage | null | undefined
): NormalizedModelUsage {
  if (!usage) return {};

  const inputTokens = usage.inputTokens;
  const cacheReadTokens = usage.inputTokenDetails?.cacheReadTokens;
  const cacheWriteTokens = usage.inputTokenDetails?.cacheWriteTokens;
  let noCacheInputTokens = usage.inputTokenDetails?.noCacheTokens;
  const outputTokens = usage.outputTokens;
  const reasoningTokens = usage.outputTokenDetails?.reasoningTokens;
  const totalTokens = usage.totalTokens;

  for (const [name, value] of Object.entries({
    inputTokens,
    noCacheInputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    outputTokens,
    reasoningTokens,
    totalTokens,
  })) {
    validateTokenCount(name, value);
  }

  if (inputTokens !== undefined) {
    const cacheRead = cacheReadTokens ?? 0;
    const cacheWrite = cacheWriteTokens ?? 0;
    if (cacheRead + cacheWrite > inputTokens) {
      throw new TypeError('Cached input tokens exceed total input tokens');
    }

    const derivedNoCacheInputTokens = inputTokens - cacheRead - cacheWrite;
    if (
      noCacheInputTokens !== undefined
      && noCacheInputTokens !== derivedNoCacheInputTokens
    ) {
      throw new TypeError('Input token details do not equal total input tokens');
    }
    noCacheInputTokens = derivedNoCacheInputTokens;
  }

  if (
    outputTokens !== undefined
    && reasoningTokens !== undefined
    && reasoningTokens > outputTokens
  ) {
    throw new TypeError('Reasoning tokens exceed total output tokens');
  }

  return {
    ...(inputTokens !== undefined ? { inputTokens } : {}),
    ...(noCacheInputTokens !== undefined ? { noCacheInputTokens } : {}),
    ...(cacheReadTokens !== undefined ? { cacheReadTokens } : {}),
    ...(cacheWriteTokens !== undefined ? { cacheWriteTokens } : {}),
    ...(outputTokens !== undefined ? { outputTokens } : {}),
    ...(reasoningTokens !== undefined ? { reasoningTokens } : {}),
    ...(totalTokens !== undefined ? { totalTokens } : {}),
  };
}

export function hasReportedModelUsage(usage: NormalizedModelUsage) {
  return usage.inputTokens !== undefined || usage.outputTokens !== undefined;
}

export function sanitizeFinishReason(value: unknown): string | undefined {
  return typeof value === 'string' && FINISH_REASONS.has(value)
    ? value
    : undefined;
}

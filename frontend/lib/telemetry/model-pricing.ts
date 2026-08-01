import 'server-only';

import { CHAT_MODEL_OPTIONS, isConcreteChatModelOption } from '@/lib/chat-models';
import type { NormalizedModelUsage } from '@/lib/telemetry/model-usage';
import { hasReportedModelUsage } from '@/lib/telemetry/model-usage';

const ONE_MILLION = BigInt(1_000_000);
const NANO_USD_PER_USD = BigInt(1_000_000_000);

interface TokenRates {
  inputUsdPerMillion: string;
  cacheReadUsdPerMillion: string;
  cacheWriteUsdPerMillion?: string;
  outputUsdPerMillion: string;
}

interface PriceTier extends TokenRates {
  maxInputTokens?: number;
}

export interface ModelPriceVersion {
  effectiveAt: string;
  version: string;
  sourceUrl: string;
  reviewedAt: string;
  inputIncludesCachedTokens: true;
  reasoningIncludedInOutputTokens: true;
  tiers: readonly PriceTier[];
}

export interface UnpricedModel {
  unpricedReason: string;
  sourceUrl: string;
  reviewedAt: string;
}

type PriceRegistryEntry =
  | { prices: readonly ModelPriceVersion[]; unpriced?: never }
  | { prices?: never; unpriced: UnpricedModel };

const OPENAI_GPT_5_5_SOURCE = 'https://developers.openai.com/api/docs/models/gpt-5.5';
const OPENAI_GPT_5_4_SOURCE = 'https://developers.openai.com/api/docs/models/gpt-5.4';
const ANTHROPIC_SOURCE = 'https://platform.claude.com/docs/en/about-claude/pricing';
const GOOGLE_SOURCE = 'https://ai.google.dev/gemini-api/docs/pricing';
const DEEPSEEK_SOURCE = 'https://api-docs.deepseek.com/quick_start/pricing';
const OPENROUTER_DEEPSEEK_V4_FLASH_SOURCE =
  'https://openrouter.ai/deepseek/deepseek-v4-flash/api';
const ALIBABA_SOURCE = 'https://help.aliyun.com/en/model-studio/model-pricing';
const MOONSHOT_SOURCE = 'https://platform.moonshot.ai/docs';

export const MODEL_PRICE_REGISTRY = {
  'openai:gpt-5.5': {
    prices: [{
      effectiveAt: '2026-04-23T00:00:00.000Z',
      version: 'openai-2026-07-31',
      sourceUrl: OPENAI_GPT_5_5_SOURCE,
      reviewedAt: '2026-07-31',
      inputIncludesCachedTokens: true,
      reasoningIncludedInOutputTokens: true,
      tiers: [
        {
          maxInputTokens: 272_000,
          inputUsdPerMillion: '5',
          cacheReadUsdPerMillion: '0.5',
          outputUsdPerMillion: '30',
        },
        {
          inputUsdPerMillion: '10',
          cacheReadUsdPerMillion: '1',
          outputUsdPerMillion: '45',
        },
      ],
    }],
  },
  'openai:gpt-5.4': {
    prices: [{
      effectiveAt: '2026-03-05T00:00:00.000Z',
      version: 'openai-2026-07-31',
      sourceUrl: OPENAI_GPT_5_4_SOURCE,
      reviewedAt: '2026-07-31',
      inputIncludesCachedTokens: true,
      reasoningIncludedInOutputTokens: true,
      tiers: [
        {
          maxInputTokens: 272_000,
          inputUsdPerMillion: '2.5',
          cacheReadUsdPerMillion: '0.25',
          outputUsdPerMillion: '15',
        },
        {
          inputUsdPerMillion: '5',
          cacheReadUsdPerMillion: '0.5',
          outputUsdPerMillion: '22.5',
        },
      ],
    }],
  },
  'anthropic:claude-sonnet-4-6': {
    prices: [{
      effectiveAt: '2026-01-01T00:00:00.000Z',
      version: 'anthropic-2026-07-31',
      sourceUrl: ANTHROPIC_SOURCE,
      reviewedAt: '2026-07-31',
      inputIncludesCachedTokens: true,
      reasoningIncludedInOutputTokens: true,
      tiers: [{
        inputUsdPerMillion: '3',
        cacheReadUsdPerMillion: '0.3',
        cacheWriteUsdPerMillion: '3.75',
        outputUsdPerMillion: '15',
      }],
    }],
  },
  'anthropic:claude-opus-4-8': {
    prices: [{
      effectiveAt: '2026-01-01T00:00:00.000Z',
      version: 'anthropic-2026-07-31',
      sourceUrl: ANTHROPIC_SOURCE,
      reviewedAt: '2026-07-31',
      inputIncludesCachedTokens: true,
      reasoningIncludedInOutputTokens: true,
      tiers: [{
        inputUsdPerMillion: '5',
        cacheReadUsdPerMillion: '0.5',
        cacheWriteUsdPerMillion: '6.25',
        outputUsdPerMillion: '25',
      }],
    }],
  },
  'google:gemini-3.1-pro-preview': {
    prices: [{
      effectiveAt: '2026-02-19T00:00:00.000Z',
      version: 'google-2026-07-31',
      sourceUrl: GOOGLE_SOURCE,
      reviewedAt: '2026-07-31',
      inputIncludesCachedTokens: true,
      reasoningIncludedInOutputTokens: true,
      tiers: [
        {
          maxInputTokens: 200_000,
          inputUsdPerMillion: '2',
          cacheReadUsdPerMillion: '0.2',
          outputUsdPerMillion: '12',
        },
        {
          inputUsdPerMillion: '4',
          cacheReadUsdPerMillion: '0.4',
          outputUsdPerMillion: '18',
        },
      ],
    }],
  },
  'google:gemini-3-flash-preview': {
    prices: [{
      effectiveAt: '2025-12-17T00:00:00.000Z',
      version: 'google-2026-07-31',
      sourceUrl: GOOGLE_SOURCE,
      reviewedAt: '2026-07-31',
      inputIncludesCachedTokens: true,
      reasoningIncludedInOutputTokens: true,
      tiers: [{
        inputUsdPerMillion: '0.5',
        cacheReadUsdPerMillion: '0.05',
        outputUsdPerMillion: '3',
      }],
    }],
  },
  'deepseek:deepseek-v4-flash': {
    prices: [{
      effectiveAt: '2026-07-24T16:00:00.000Z',
      version: 'deepseek-2026-07-31',
      sourceUrl: DEEPSEEK_SOURCE,
      reviewedAt: '2026-07-31',
      inputIncludesCachedTokens: true,
      reasoningIncludedInOutputTokens: true,
      tiers: [{
        inputUsdPerMillion: '0.14',
        cacheReadUsdPerMillion: '0.0028',
        outputUsdPerMillion: '0.28',
      }],
    }],
  },
  'openrouter:deepseek/deepseek-v4-flash': {
    prices: [{
      effectiveAt: '2026-08-01T00:00:00.000Z',
      version: 'openrouter-2026-08-01',
      sourceUrl: OPENROUTER_DEEPSEEK_V4_FLASH_SOURCE,
      reviewedAt: '2026-08-01',
      inputIncludesCachedTokens: true,
      reasoningIncludedInOutputTokens: true,
      tiers: [{
        inputUsdPerMillion: '0.0896',
        cacheReadUsdPerMillion: '0.01792',
        outputUsdPerMillion: '0.1792',
      }],
    }],
  },
  'deepseek:deepseek-v4-pro': {
    prices: [{
      effectiveAt: '2026-07-24T16:00:00.000Z',
      version: 'deepseek-2026-07-31',
      sourceUrl: DEEPSEEK_SOURCE,
      reviewedAt: '2026-07-31',
      inputIncludesCachedTokens: true,
      reasoningIncludedInOutputTokens: true,
      tiers: [{
        inputUsdPerMillion: '0.435',
        cacheReadUsdPerMillion: '0.003625',
        outputUsdPerMillion: '0.87',
      }],
    }],
  },
  'alibaba:qwen3.7-plus': {
    unpriced: {
      unpricedReason:
        'The official rate is denominated in CNY and varies by deployment region, context size, and thinking mode.',
      sourceUrl: ALIBABA_SOURCE,
      reviewedAt: '2026-07-31',
    },
  },
  'moonshot:kimi-k2.7-code': {
    unpriced: {
      unpricedReason:
        'No unambiguous public pay-as-you-go USD token rate is published for the configured coding endpoint.',
      sourceUrl: MOONSHOT_SOURCE,
      reviewedAt: '2026-07-31',
    },
  },
} as const satisfies Record<string, PriceRegistryEntry>;

export type ModelCostResult =
  | { status: 'priced'; estimatedCostNanousd: bigint; pricingVersion: string }
  | { status: 'missing_usage'; estimatedCostNanousd: null; pricingVersion: null }
  | { status: 'missing_price'; estimatedCostNanousd: null; pricingVersion: null };

function decimalUsdToNanousd(value: string) {
  const match = /^(\d+)(?:\.(\d{1,9}))?$/.exec(value);
  if (!match) throw new TypeError('Invalid USD rate');
  const fraction = (match[2] ?? '').padEnd(9, '0');
  return BigInt(match[1]) * NANO_USD_PER_USD + BigInt(fraction || '0');
}

function selectPriceVersion(
  prices: readonly ModelPriceVersion[],
  startedAt: Date
) {
  const timestamp = startedAt.getTime();
  if (!Number.isFinite(timestamp)) return null;
  return [...prices]
    .filter((price) => Date.parse(price.effectiveAt) <= timestamp)
    .sort((left, right) => Date.parse(right.effectiveAt) - Date.parse(left.effectiveAt))[0]
    ?? null;
}

function selectTier(price: ModelPriceVersion, inputTokens: number) {
  return price.tiers.find(
    (tier) => tier.maxInputTokens === undefined || inputTokens <= tier.maxInputTokens
  ) ?? null;
}

function tokenCharge(tokens: number, usdPerMillion: string) {
  return BigInt(tokens) * decimalUsdToNanousd(usdPerMillion);
}

export function calculateModelCost(params: {
  provider: string;
  providerModelId: string;
  usage: NormalizedModelUsage;
  startedAt: Date;
}): ModelCostResult {
  if (
    !hasReportedModelUsage(params.usage)
    || params.usage.inputTokens === undefined
    || params.usage.outputTokens === undefined
  ) {
    return {
      status: 'missing_usage',
      estimatedCostNanousd: null,
      pricingVersion: null,
    };
  }

  const key = `${params.provider}:${params.providerModelId}`;
  const entry = (MODEL_PRICE_REGISTRY as Record<string, PriceRegistryEntry>)[key];
  if (!entry || entry.unpriced) {
    return {
      status: 'missing_price',
      estimatedCostNanousd: null,
      pricingVersion: null,
    };
  }

  const price = selectPriceVersion(entry.prices, params.startedAt);
  const tier = price && selectTier(price, params.usage.inputTokens);
  if (!price || !tier) {
    return {
      status: 'missing_price',
      estimatedCostNanousd: null,
      pricingVersion: null,
    };
  }

  const cacheReadTokens = params.usage.cacheReadTokens ?? 0;
  const cacheWriteTokens = params.usage.cacheWriteTokens ?? 0;
  const noCacheInputTokens = params.usage.noCacheInputTokens
    ?? params.usage.inputTokens - cacheReadTokens - cacheWriteTokens;

  if (
    noCacheInputTokens < 0
    || noCacheInputTokens + cacheReadTokens + cacheWriteTokens
      !== params.usage.inputTokens
    || (cacheWriteTokens > 0 && !tier.cacheWriteUsdPerMillion)
  ) {
    return {
      status: 'missing_price',
      estimatedCostNanousd: null,
      pricingVersion: null,
    };
  }

  const numerator =
    tokenCharge(noCacheInputTokens, tier.inputUsdPerMillion)
    + tokenCharge(cacheReadTokens, tier.cacheReadUsdPerMillion)
    + tokenCharge(cacheWriteTokens, tier.cacheWriteUsdPerMillion ?? '0')
    + tokenCharge(params.usage.outputTokens, tier.outputUsdPerMillion);

  return {
    status: 'priced',
    estimatedCostNanousd: (numerator + ONE_MILLION / BigInt(2)) / ONE_MILLION,
    pricingVersion: price.version,
  };
}

export function formatNanousdAsUsd(value: bigint, maximumFractionDigits = 6) {
  const zero = BigInt(0);
  const sign = value < zero ? '-' : '';
  const absolute = value < zero ? -value : value;
  const whole = absolute / NANO_USD_PER_USD;
  const fraction = (absolute % NANO_USD_PER_USD)
    .toString()
    .padStart(9, '0')
    .slice(0, Math.max(0, Math.min(9, maximumFractionDigits)))
    .replace(/0+$/, '');
  return `${sign}${whole}${fraction ? `.${fraction}` : ''}`;
}

export function getCatalogPricingCoverage() {
  return CHAT_MODEL_OPTIONS
    .filter(isConcreteChatModelOption)
    .map((model) => {
      const key = `${model.provider}:${model.apiModelId}`;
      const entry = (MODEL_PRICE_REGISTRY as Record<string, PriceRegistryEntry>)[key];
      return {
        modelId: model.id,
        providerModelId: model.apiModelId,
        covered: Boolean(entry),
        priced: Boolean(entry?.prices),
        unpricedReason: entry?.unpriced?.unpricedReason ?? null,
      };
    });
}

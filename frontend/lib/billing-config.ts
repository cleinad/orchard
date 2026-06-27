import type { ChatModelId, ConcreteChatModelId } from '@/lib/chat-models';

export const FREE_PLAN_KEY = 'free';
export const PLUS_PLAN_KEY = 'keen_plus';
export const PRO_PLAN_KEY = 'keen_pro';
export const LEGACY_PAID_MONTHLY_PLAN_KEY = 'keen_monthly';

// Backward-compatible alias for older billing code/tests that used one paid plan.
export const PAID_MONTHLY_PLAN_KEY = PLUS_PLAN_KEY;

export type BillingPlanKey =
  | typeof FREE_PLAN_KEY
  | typeof PLUS_PLAN_KEY
  | typeof PRO_PLAN_KEY;

export type ChatModelBillingClass = 'free' | 'standard' | 'premium' | 'max';

export interface BillingPlanLimits {
  rollingWindowHours: number;
  rollingTotalLimit: number;
  monthlyTotalLimit: number;
  rollingPremiumUnitLimit: number;
  monthlyPremiumUnitLimit: number;
}

export const BILLING_PLAN_LIMITS: Record<BillingPlanKey, BillingPlanLimits> = {
  [FREE_PLAN_KEY]: {
    rollingWindowHours: 3,
    rollingTotalLimit: 20,
    monthlyTotalLimit: 250,
    rollingPremiumUnitLimit: 0,
    monthlyPremiumUnitLimit: 0,
  },
  [PLUS_PLAN_KEY]: {
    rollingWindowHours: 3,
    rollingTotalLimit: 100,
    monthlyTotalLimit: 2500,
    rollingPremiumUnitLimit: 20,
    monthlyPremiumUnitLimit: 200,
  },
  [PRO_PLAN_KEY]: {
    rollingWindowHours: 3,
    rollingTotalLimit: 250,
    monthlyTotalLimit: 7500,
    rollingPremiumUnitLimit: 60,
    monthlyPremiumUnitLimit: 600,
  },
};

// Legacy shape used by existing billing projection rows and UI labels.
export const BILLING_LIMITS: Record<BillingPlanKey, number> = {
  [FREE_PLAN_KEY]: BILLING_PLAN_LIMITS[FREE_PLAN_KEY].monthlyTotalLimit,
  [PLUS_PLAN_KEY]: BILLING_PLAN_LIMITS[PLUS_PLAN_KEY].monthlyTotalLimit,
  [PRO_PLAN_KEY]: BILLING_PLAN_LIMITS[PRO_PLAN_KEY].monthlyTotalLimit,
};

export const CHAT_MODEL_BILLING_CLASSES: Record<ChatModelId, ChatModelBillingClass> = {
  auto: 'free',
  'deepseek-v4-flash': 'standard',
  'deepseek-v4-pro': 'standard',
  'qwen3.7-plus': 'standard',
  'kimi-k2.7-code': 'standard',
  'gemini-3-flash-preview': 'standard',
  'gemini-3.1-pro-preview': 'premium',
  'gpt-5.4': 'premium',
  'claude-sonnet-4-6': 'premium',
  'gpt-5.5': 'max',
  'claude-opus-4-8': 'max',
};

export function getBillingPlanLimits(planKey: BillingPlanKey) {
  return BILLING_PLAN_LIMITS[planKey] ?? BILLING_PLAN_LIMITS[FREE_PLAN_KEY];
}

export function getChatModelBillingClass(
  modelId: ChatModelId | string | null | undefined
): ChatModelBillingClass {
  if (!modelId || !(modelId in CHAT_MODEL_BILLING_CLASSES)) {
    return 'premium';
  }

  return CHAT_MODEL_BILLING_CLASSES[modelId as ChatModelId];
}

export function requiresPaidPlanForModel(
  modelId: ChatModelId | string | null | undefined
) {
  return getChatModelBillingClass(modelId) !== 'free';
}

export function getPremiumUsageUnits(
  modelId: ConcreteChatModelId | ChatModelId | string | null | undefined
) {
  const billingClass = getChatModelBillingClass(modelId);

  if (billingClass === 'max') {
    return 2;
  }

  if (billingClass === 'premium') {
    return 1;
  }

  return 0;
}

export function isPaidChatModel(modelId: ChatModelId | string | null | undefined) {
  return requiresPaidPlanForModel(modelId);
}

export function getBillingPlanForStripePrice(
  priceId: string | null | undefined
): BillingPlanKey | null {
  if (!priceId) {
    return null;
  }

  if (
    process.env.STRIPE_PRICE_PRO_MONTHLY_ID
    && priceId === process.env.STRIPE_PRICE_PRO_MONTHLY_ID
  ) {
    return PRO_PLAN_KEY;
  }

  if (
    priceId === process.env.STRIPE_PRICE_PLUS_MONTHLY_ID
    || priceId === process.env.STRIPE_PRICE_MONTHLY_ID
  ) {
    return PLUS_PLAN_KEY;
  }

  return null;
}

export function isMonthlyStripePrice(priceId: string | null | undefined) {
  return Boolean(getBillingPlanForStripePrice(priceId));
}

import type { ChatModelId } from '@/lib/chat-models';

export const FREE_PLAN_KEY = 'free';
export const PAID_MONTHLY_PLAN_KEY = 'keen_monthly';

export type BillingPlanKey = typeof FREE_PLAN_KEY | typeof PAID_MONTHLY_PLAN_KEY;

export const BILLING_LIMITS: Record<BillingPlanKey, number> = {
  [FREE_PLAN_KEY]: 20,
  [PAID_MONTHLY_PLAN_KEY]: 1000,
};

export const PAID_CHAT_MODEL_IDS = [
  'gpt-5.4',
  'claude-sonnet-4-6',
] as const satisfies readonly ChatModelId[];

export function isPaidChatModel(modelId: ChatModelId | string | null | undefined) {
  return PAID_CHAT_MODEL_IDS.some((paidModelId) => paidModelId === modelId);
}

export function isMonthlyStripePrice(priceId: string | null | undefined) {
  return Boolean(priceId && process.env.STRIPE_PRICE_MONTHLY_ID === priceId);
}

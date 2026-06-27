import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  computeEntitlementFromProjection,
  computeEntitlementFromSubscription,
  getBillingEntitlement,
  getBillingDisplayState,
  getCurrentUsagePeriod,
} from '@/lib/billing';

describe('billing entitlement computation', () => {
  beforeEach(() => {
    vi.stubEnv('STRIPE_PRICE_MONTHLY_ID', 'price_monthly');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(['active', 'trialing'] as const)(
    'grants paid entitlement for %s monthly subscriptions',
    (status) => {
      const entitlement = computeEntitlementFromSubscription(
        {
          subscription_id: 'sub_123',
          price_id: 'price_monthly',
          status,
          current_period_start: '2026-06-01T00:00:00.000Z',
          current_period_end: '2026-07-01T00:00:00.000Z',
          cancel_at_period_end: false,
        },
        new Date('2026-06-12T00:00:00.000Z')
      );

      expect(entitlement.planKey).toBe('keen_plus');
      expect(entitlement.canUseCloudModels).toBe(true);
      expect(entitlement.monthlyLimit).toBe(2500);
    }
  );

  it('keeps access while an active subscription is canceling at period end', () => {
    const subscription = {
      subscription_id: 'sub_123',
      price_id: 'price_monthly',
      status: 'active',
      current_period_start: '2026-06-01T00:00:00.000Z',
      current_period_end: '2026-07-01T00:00:00.000Z',
      cancel_at_period_end: true,
    };

    const entitlement = computeEntitlementFromSubscription(
      subscription,
      new Date('2026-06-12T00:00:00.000Z')
    );

    expect(entitlement.canUseCloudModels).toBe(true);
    expect(getBillingDisplayState(subscription)).toBe('canceling_at_period_end');
  });

  it('treats future cancel_at as canceling while keeping paid access', () => {
    const subscription = {
      subscription_id: 'sub_123',
      price_id: 'price_monthly',
      status: 'active',
      current_period_start: '2026-06-01T00:00:00.000Z',
      current_period_end: '2026-07-01T00:00:00.000Z',
      cancel_at_period_end: false,
      cancel_at: '2026-07-01T00:00:00.000Z',
    };
    const now = new Date('2026-06-12T00:00:00.000Z');

    const entitlement = computeEntitlementFromSubscription(subscription, now);

    expect(entitlement.canUseCloudModels).toBe(true);
    expect(entitlement.displayState).toBe('canceling_at_period_end');
    expect(getBillingDisplayState(subscription, now)).toBe('canceling_at_period_end');
  });

  it.each(['past_due', 'unpaid', 'canceled', 'incomplete', 'incomplete_expired'] as const)(
    'fails closed for %s subscriptions',
    (status) => {
      const entitlement = computeEntitlementFromSubscription(
        {
          subscription_id: 'sub_123',
          price_id: 'price_monthly',
          status,
          current_period_start: '2026-06-01T00:00:00.000Z',
          current_period_end: '2026-07-01T00:00:00.000Z',
          cancel_at_period_end: false,
        },
        new Date('2026-06-12T00:00:00.000Z')
      );

      expect(entitlement.planKey).toBe('free');
      expect(entitlement.canUseCloudModels).toBe(false);
      expect(entitlement.monthlyLimit).toBe(250);
    }
  );

  it('fails closed when the billing period is stale or the price id is not mapped', () => {
    const staleEntitlement = computeEntitlementFromSubscription(
      {
        subscription_id: 'sub_123',
        price_id: 'price_monthly',
        status: 'active',
        current_period_start: '2026-05-01T00:00:00.000Z',
        current_period_end: '2026-06-01T00:00:00.000Z',
        cancel_at_period_end: false,
      },
      new Date('2026-06-12T00:00:00.000Z')
    );
    const wrongPriceEntitlement = computeEntitlementFromSubscription(
      {
        subscription_id: 'sub_456',
        price_id: 'price_other',
        status: 'active',
        current_period_start: '2026-06-01T00:00:00.000Z',
        current_period_end: '2026-07-01T00:00:00.000Z',
        cancel_at_period_end: false,
      },
      new Date('2026-06-12T00:00:00.000Z')
    );

    expect(staleEntitlement.canUseCloudModels).toBe(false);
    expect(wrongPriceEntitlement.canUseCloudModels).toBe(false);
  });

  it('fails closed when an otherwise active subscription is missing its period end', () => {
    const entitlement = computeEntitlementFromSubscription(
      {
        subscription_id: 'sub_123',
        price_id: 'price_monthly',
        status: 'active',
        current_period_start: '2026-06-01T00:00:00.000Z',
        current_period_end: null,
        cancel_at_period_end: false,
      },
      new Date('2026-06-12T00:00:00.000Z')
    );

    expect(entitlement.canUseCloudModels).toBe(false);
  });


  it('computes UTC monthly usage windows', () => {
    expect(getCurrentUsagePeriod(new Date('2026-06-12T19:00:00.000Z'))).toEqual({
      periodStart: '2026-06-01T00:00:00.000Z',
      periodEnd: '2026-07-01T00:00:00.000Z',
    });
  });

  it('uses trusted entitlement projections for fast gating', () => {
    const entitlement = computeEntitlementFromProjection(
      {
        plan_key: 'keen_plus',
        can_use_cloud_models: true,
        monthly_limit: 999999,
        status: 'active',
        subscription_id: 'sub_123',
        current_period_start: '2026-06-01T00:00:00.000Z',
        current_period_end: '2026-07-01T00:00:00.000Z',
        display_state: 'active',
        refreshed_at: '2026-06-12T00:00:00.000Z',
      },
      new Date('2026-06-12T00:00:00.000Z')
    );

    expect(entitlement).toMatchObject({
      planKey: 'keen_plus',
      canUseCloudModels: true,
      monthlyLimit: 2500,
      subscriptionId: 'sub_123',
      displayState: 'active',
    });
  });

  it('fails closed for missing, stale, or internally inconsistent projections', () => {
    expect(computeEntitlementFromProjection(null).canUseCloudModels).toBe(false);
    expect(
      computeEntitlementFromProjection(
        {
          plan_key: 'keen_plus',
          can_use_cloud_models: true,
          monthly_limit: 2500,
          status: 'active',
          subscription_id: 'sub_123',
          current_period_start: '2026-05-01T00:00:00.000Z',
          current_period_end: '2026-06-01T00:00:00.000Z',
          display_state: 'active',
          refreshed_at: '2026-06-12T00:00:00.000Z',
        },
        new Date('2026-06-12T00:00:00.000Z')
      ).canUseCloudModels
    ).toBe(false);
    expect(
      computeEntitlementFromProjection(
        {
          plan_key: 'free',
          can_use_cloud_models: true,
          monthly_limit: 2500,
          status: 'active',
          subscription_id: 'sub_123',
          current_period_start: '2026-06-01T00:00:00.000Z',
          current_period_end: '2026-07-01T00:00:00.000Z',
          display_state: 'active',
          refreshed_at: '2026-06-12T00:00:00.000Z',
        },
        new Date('2026-06-12T00:00:00.000Z')
      ).canUseCloudModels
    ).toBe(false);
  });

  it('loads entitlement projection rather than client-controlled values', async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({
              data: {
                plan_key: 'keen_plus',
                can_use_cloud_models: true,
                monthly_limit: 2500,
                status: 'trialing',
                subscription_id: 'sub_123',
                current_period_start: '2026-06-01T00:00:00.000Z',
                current_period_end: '2026-07-01T00:00:00.000Z',
                display_state: 'trialing',
                refreshed_at: '2026-06-12T00:00:00.000Z',
              },
              error: null,
            }),
          }),
        }),
      }),
    };

    await expect(getBillingEntitlement(supabase as never, 'user-1')).resolves.toMatchObject({
      planKey: 'keen_plus',
      canUseCloudModels: true,
      status: 'trialing',
    });
  });
});

import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  AdminDashboard,
  AdminDashboardError,
} from '@/app/admin/AdminDashboard';
import AdminLoading from '@/app/admin/loading';
import type { AdminUsageDashboard as AdminUsageDashboardData } from '@/lib/admin/usage';

function dashboardFixture(
  overrides: Partial<AdminUsageDashboardData> = {}
): AdminUsageDashboardData {
  return {
    query: {
      preset: '30d',
      sort: 'estimated_cost',
      direction: 'desc',
      page: 1,
      pageSize: 25,
      filtersNormalized: true,
      start: '2026-07-02T00:00:00.000Z',
      end: '2026-08-01T00:00:00.000Z',
    },
    overview: {
      registeredUsers: BigInt(2),
      activeUsers: BigInt(1),
      responses: BigInt(1),
      providerCalls: BigInt(3),
      tokens: {
        input: BigInt(100),
        cacheRead: BigInt(20),
        output: BigInt(40),
        reasoning: BigInt(10),
        total: BigInt(140),
      },
      estimatedCostNanousd: BigInt(750_000),
      estimatedChatCostNanousd: BigInt(500_000),
      averageChatCostNanousd: BigInt(500_000),
      coverage: {
        completedCalls: BigInt(3),
        usageReportedCalls: BigInt(2),
        billableUsageCalls: BigInt(2),
        pricedCalls: BigInt(1),
        missingUsageCalls: BigInt(1),
        missingPriceCalls: BigInt(1),
      },
    },
    daily: [{
      date: '2026-07-31',
      responses: BigInt(1),
      providerCalls: BigInt(3),
      totalTokens: BigInt(140),
      estimatedCostNanousd: BigInt(750_000),
      missingUsageCalls: BigInt(1),
      missingPriceCalls: BigInt(1),
    }],
    models: [{
      key: 'openrouter:qwen/runtime',
      resolvedModelId: null,
      provider: 'openrouter',
      providerModelId: 'qwen/runtime',
      primaryResponses: BigInt(0),
      auxiliaryCalls: BigInt(1),
      distinctUsers: BigInt(1),
      autoRequestedResponses: BigInt(0),
      tokens: {
        input: BigInt(20),
        cacheRead: BigInt(0),
        output: BigInt(5),
        reasoning: null,
        total: BigInt(25),
      },
      estimatedCostNanousd: null,
      failedCalls: BigInt(0),
      billableUsageCalls: BigInt(1),
      pricedCalls: BigInt(0),
    }],
    users: {
      totalUsers: BigInt(2),
      page: 1,
      pageSize: 25,
      items: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          email: 'an-unusually-long-admin-email-address@example.com',
          joinedAt: '2026-07-01T00:00:00.000Z',
          lastActiveAt: '2026-07-31T12:00:00.000Z',
          responses: BigInt(1),
          providerCalls: BigInt(3),
          tokens: {
            input: BigInt(100),
            cacheRead: BigInt(20),
            output: BigInt(40),
            reasoning: BigInt(10),
            total: BigInt(140),
          },
          estimatedCostNanousd: BigInt(750_000),
          averageChatCostNanousd: BigInt(500_000),
          mostRequestedModelId: 'auto',
          mostResolvedModelId: 'gpt-5.4',
          coverage: {
            completedCalls: BigInt(3),
            usageReportedCalls: BigInt(2),
            billableUsageCalls: BigInt(2),
            pricedCalls: BigInt(1),
            missingPriceCalls: BigInt(1),
          },
        },
        {
          id: '22222222-2222-4222-8222-222222222222',
          email: 'new@example.com',
          joinedAt: '2026-07-30T00:00:00.000Z',
          lastActiveAt: null,
          responses: BigInt(0),
          providerCalls: BigInt(0),
          tokens: {
            input: null,
            cacheRead: null,
            output: null,
            reasoning: null,
            total: null,
          },
          estimatedCostNanousd: null,
          averageChatCostNanousd: null,
          mostRequestedModelId: null,
          mostResolvedModelId: null,
          coverage: {
            completedCalls: BigInt(0),
            usageReportedCalls: BigInt(0),
            billableUsageCalls: BigInt(0),
            pricedCalls: BigInt(0),
            missingPriceCalls: BigInt(0),
          },
        },
      ],
    },
    ...overrides,
  };
}

describe('admin dashboard', () => {
  it('renders aggregate metrics, explicit partial states, and accessible tables', () => {
    const html = renderToStaticMarkup(
      createElement(AdminDashboard, {
        dashboard: dashboardFixture(),
        refreshedAt: new Date('2026-07-31T15:30:00.000Z'),
      })
    );

    expect(html).toContain('Usage telemetry');
    expect(html).toContain('Some filters were reset');
    expect(html).toContain('Some totals are incomplete');
    expect(html).toContain('Usage reporting: 66.6%');
    expect(html).toContain('Pricing coverage: 50.0%');
    expect(html).toContain('Brave, Exa, Deepgram, and TTS are excluded.');
    expect(html).toContain('qwen/runtime');
    expect(html).toContain('Not applicable');
    expect(html).toContain('Unavailable');
    expect(html).toContain('Partial pricing');
    expect(html).toContain('No activity');
    expect(html).toContain('an-unusually-long-admin-email-address@example.com');
    expect(html).toContain('aria-sort="descending"');
    expect(html).toContain('View exact daily values');
    expect(html).toContain('Priced cost (striped)');
    expect(html).toContain('dateTime="2026-07-31');
    expect(html.match(/<table/g)).toHaveLength(3);
    expect(html).toContain('tabindex="0"');
    expect(html).not.toContain('prompt');
    expect(html).not.toContain('private database detail');
  });

  it('renders empty usage without treating registered users as missing', () => {
    const fixture = dashboardFixture();
    const html = renderToStaticMarkup(
      createElement(AdminDashboard, {
        dashboard: {
          ...fixture,
          overview: {
            ...fixture.overview,
            activeUsers: BigInt(0),
            responses: BigInt(0),
            providerCalls: BigInt(0),
            tokens: {
              input: null,
              cacheRead: null,
              output: null,
              reasoning: null,
              total: null,
            },
            estimatedCostNanousd: null,
            estimatedChatCostNanousd: null,
            averageChatCostNanousd: null,
            coverage: {
              completedCalls: BigInt(0),
              usageReportedCalls: BigInt(0),
              billableUsageCalls: BigInt(0),
              pricedCalls: BigInt(0),
              missingUsageCalls: BigInt(0),
              missingPriceCalls: BigInt(0),
            },
          },
          daily: [],
          models: [],
        },
        refreshedAt: new Date('2026-07-31T15:30:00.000Z'),
      })
    );

    expect(html).toContain('No model usage in this period');
    expect(html).toContain('2 registered users remain visible');
    expect(html).toContain('No daily activity yet');
    expect(html).toContain('No model usage in this period.');
    expect(html).toContain('No responses');
  });

  it('renders safe error and loading states', () => {
    const errorHtml = renderToStaticMarkup(
      createElement(AdminDashboardError, { retryHref: '/admin' })
    );
    const loadingHtml = renderToStaticMarkup(createElement(AdminLoading));

    expect(errorHtml).toContain('Usage data is unavailable');
    expect(errorHtml).toContain('No raw telemetry was exposed');
    expect(errorHtml).toContain('Try again');
    expect(loadingHtml).toContain('aria-busy="true"');
    expect(loadingHtml).toContain('Loading usage aggregates');
  });
});

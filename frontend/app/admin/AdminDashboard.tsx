import Link from 'next/link';
import type { CSSProperties } from 'react';
import { LocalizedDate } from '@/app/admin/LocalizedDate';
import OrchardBrand from '@/app/components/OrchardBrand';
import ThemePicker from '@/app/components/ThemePicker';
import type {
  AdminUsageDashboard as AdminUsageDashboardData,
  AdminUsageModel,
  AdminUsageQuery,
  AdminUsageSort,
  AdminUsageUser,
} from '@/lib/admin/usage';
import { formatNanousdAsUsd } from '@/lib/telemetry/model-pricing';

const integerFormatter = new Intl.NumberFormat('en-US');
const compactFormatter = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
});
const dateFormatter = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeZone: 'UTC',
});
const timestampFormatter = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'UTC',
  timeZoneName: 'short',
});

const rangeLabels = {
  '7d': '7 days',
  '30d': '30 days',
  all: 'All time',
} as const;

function formatInteger(value: bigint) {
  return integerFormatter.format(value);
}

function formatCompact(value: bigint | null) {
  return value === null ? 'Unavailable' : compactFormatter.format(value);
}

function formatCost(value: bigint | null) {
  return value === null ? 'Unavailable' : `$${formatNanousdAsUsd(value, 6)}`;
}

function formatDate(value: string | null, timeZone?: 'UTC') {
  return value ? (
    <LocalizedDate
      value={value}
      fallback={dateFormatter.format(new Date(value))}
      timeZone={timeZone}
    />
  ) : 'No activity';
}

function formatResponseCount(value: bigint) {
  return `${formatInteger(value)} ${value === BigInt(1) ? 'response' : 'responses'}`;
}

function formatCoverage(numerator: bigint, denominator: bigint) {
  if (denominator === BigInt(0)) return 'No eligible calls';
  const tenths = numerator * BigInt(1_000) / denominator;
  return `${tenths / BigInt(10)}.${tenths % BigInt(10)}%`;
}

function buildAdminHref(
  query: AdminUsageQuery,
  changes: Partial<{
    range: AdminUsageQuery['preset'];
    sort: AdminUsageSort;
    direction: AdminUsageQuery['direction'];
    page: number;
  }>
) {
  const params = new URLSearchParams({
    range: changes.range ?? query.preset,
    sort: changes.sort ?? query.sort,
    direction: changes.direction ?? query.direction,
    page: String(changes.page ?? query.page),
    pageSize: String(query.pageSize),
  });
  return `/admin?${params.toString()}`;
}

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="min-w-0 py-4 sm:py-5">
      <dt className="font-sans text-xs text-muted">{label}</dt>
      <dd className="mt-1.5 font-sans text-2xl font-medium tabular-nums text-foreground">
        {value}
      </dd>
      {detail ? (
        <dd className="mt-1 font-sans text-xs leading-5 text-muted">{detail}</dd>
      ) : null}
    </div>
  );
}

function StatusNotice({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-l-2 border-accent pl-4 font-sans">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 max-w-3xl text-sm leading-6 text-muted">{children}</p>
    </div>
  );
}

function TableFrame({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      tabIndex={0}
      role="region"
      aria-label={label}
      className="overflow-x-auto rounded-lg border border-border-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
    >
      {children}
    </div>
  );
}

function TokenSummary({
  input,
  cacheRead,
  output,
  reasoning,
  total,
}: {
  input: bigint | null;
  cacheRead: bigint | null;
  output: bigint | null;
  reasoning: bigint | null;
  total: bigint | null;
}) {
  if (total === null && input === null && output === null) {
    return <span className="text-muted">Unavailable</span>;
  }

  return (
    <span className="grid min-w-40 grid-cols-[auto_1fr] gap-x-2 text-xs leading-5">
      <span className="text-muted">Total</span>
      <span className="text-right tabular-nums">{formatCompact(total)}</span>
      <span className="text-muted">Input / cached</span>
      <span className="text-right tabular-nums">
        {formatCompact(input)} / {formatCompact(cacheRead)}
      </span>
      <span className="text-muted">Output / reasoning</span>
      <span className="text-right tabular-nums">
        {formatCompact(output)} / {formatCompact(reasoning)}
      </span>
    </span>
  );
}

function CostValue({
  value,
  isPartial,
}: {
  value: bigint | null;
  isPartial: boolean;
}) {
  return (
    <span>
      <span className="block tabular-nums">{formatCost(value)}</span>
      {isPartial ? (
        <span className="mt-0.5 block text-xs font-medium text-muted">Partial pricing</span>
      ) : null}
    </span>
  );
}

function DailyActivity({ dashboard }: { dashboard: AdminUsageDashboardData }) {
  if (dashboard.daily.length === 0) {
    return (
      <div className="border-y border-border-subtle py-9 text-center font-sans">
        <p className="text-sm font-medium text-foreground">No daily activity yet</p>
        <p className="mt-1 text-sm text-muted">
          Model calls in this period will appear here after their terminal usage is recorded.
        </p>
      </div>
    );
  }

  const maximumResponses = dashboard.daily.reduce(
    (maximum, point) => point.responses > maximum ? point.responses : maximum,
    BigInt(0)
  );
  const maximumCost = dashboard.daily.reduce(
    (maximum, point) =>
      point.estimatedCostNanousd !== null && point.estimatedCostNanousd > maximum
        ? point.estimatedCostNanousd
        : maximum,
    BigInt(0)
  );
  const barHeight = (value: bigint | null, maximum: bigint) => {
    if (value === null || value === BigInt(0) || maximum === BigInt(0)) return 0;
    return Math.max(6, Number(value * BigInt(100) / maximum));
  };

  return (
    <figure>
      <div
        role="img"
        aria-label="Daily responses and estimated model cost. A text summary follows."
        className="flex h-48 min-w-[34rem] items-end gap-1 border-b border-border-subtle px-1 pt-5"
      >
        {dashboard.daily.map((point) => (
          <div
            key={point.date}
            className="flex h-full min-w-3 flex-1 items-end justify-center gap-px"
            title={`${dateFormatter.format(new Date(point.date))}: ${formatResponseCount(point.responses)}; ${formatCost(point.estimatedCostNanousd)} estimated cost`}
          >
            <span
              aria-hidden="true"
              className="w-[42%] min-w-1 rounded-t-sm bg-foreground/70"
              style={{ height: `${barHeight(point.responses, maximumResponses)}%` }}
            />
            <span
              aria-hidden="true"
              className="w-[42%] min-w-1 rounded-t-sm border-x border-t border-foreground bg-accent"
              style={{
                height: `${barHeight(point.estimatedCostNanousd, maximumCost)}%`,
                backgroundImage: 'repeating-linear-gradient(135deg, transparent 0 3px, var(--foreground) 3px 4px)',
              }}
            />
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 font-sans text-xs text-muted">
        <span className="inline-flex items-center gap-2">
          <span aria-hidden="true" className="size-2 rounded-sm bg-foreground/70" />
          Responses (solid)
        </span>
        <span className="inline-flex items-center gap-2">
          <span
            aria-hidden="true"
            className="size-2 rounded-sm border border-foreground bg-accent"
            style={{
              backgroundImage: 'repeating-linear-gradient(135deg, transparent 0 2px, var(--foreground) 2px 3px)',
            }}
          />
          Priced cost (striped)
        </span>
        <span>Bars are scaled independently.</span>
      </div>
      <details className="mt-4 font-sans text-sm">
        <summary className="inline-flex min-h-11 cursor-pointer items-center rounded-lg text-foreground underline decoration-border-strong underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground">
          View exact daily values
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[38rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border-subtle text-left text-xs text-muted">
                <th scope="col" className="px-3 py-2 font-medium">Date</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Responses</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Provider calls</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Estimated cost</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Usage gaps</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Pricing gaps</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.daily.map((point) => (
                <tr key={point.date} className="border-b border-border-subtle last:border-0">
                  <th scope="row" className="px-3 py-2 text-left font-normal">
                    {formatDate(point.date, 'UTC')}
                  </th>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatInteger(point.responses)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatInteger(point.providerCalls)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatCost(point.estimatedCostNanousd)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatInteger(point.missingUsageCalls)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatInteger(point.missingPriceCalls)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

function ModelTable({ models }: { models: AdminUsageModel[] }) {
  if (models.length === 0) {
    return <p className="py-8 font-sans text-sm text-muted">No model usage in this period.</p>;
  }

  return (
    <TableFrame label="Resolved model usage table">
      <table className="w-full min-w-[70rem] border-collapse font-sans text-sm">
        <thead>
          <tr className="border-b border-border-subtle text-left text-xs text-muted">
            <th scope="col" className="px-4 py-3 font-medium">Resolved model</th>
            <th scope="col" className="px-4 py-3 text-right font-medium">Responses</th>
            <th scope="col" className="px-4 py-3 text-right font-medium">Auxiliary</th>
            <th scope="col" className="px-4 py-3 text-right font-medium">Users</th>
            <th scope="col" className="px-4 py-3 text-right font-medium">Auto share</th>
            <th scope="col" className="px-4 py-3 font-medium">Tokens</th>
            <th scope="col" className="px-4 py-3 text-right font-medium">Estimated cost</th>
            <th scope="col" className="px-4 py-3 text-right font-medium">Failed</th>
          </tr>
        </thead>
        <tbody>
          {models.map((model) => {
            const autoShare = model.primaryResponses === BigInt(0)
              ? 'Not applicable'
              : formatCoverage(model.autoRequestedResponses, model.primaryResponses);
            return (
              <tr key={`${model.key}:${model.provider}`} className="border-b border-border-subtle last:border-0">
                <th scope="row" className="px-4 py-4 text-left align-top font-medium">
                  <span className="block text-foreground">
                    {model.resolvedModelId ?? model.providerModelId}
                  </span>
                  <span className="mt-1 block text-xs font-normal text-muted">
                    {model.provider} · {model.providerModelId}
                  </span>
                </th>
                <td className="px-4 py-4 text-right align-top tabular-nums">
                  {formatInteger(model.primaryResponses)}
                </td>
                <td className="px-4 py-4 text-right align-top tabular-nums">
                  {formatInteger(model.auxiliaryCalls)}
                </td>
                <td className="px-4 py-4 text-right align-top tabular-nums">
                  {formatInteger(model.distinctUsers)}
                </td>
                <td className="px-4 py-4 text-right align-top">{autoShare}</td>
                <td className="px-4 py-4 align-top">
                  <TokenSummary {...model.tokens} />
                </td>
                <td className="px-4 py-4 text-right align-top">
                  <CostValue
                    value={model.estimatedCostNanousd}
                    isPartial={model.pricedCalls < model.billableUsageCalls}
                  />
                </td>
                <td className="px-4 py-4 text-right align-top tabular-nums">
                  {formatInteger(model.failedCalls)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </TableFrame>
  );
}

function SortHeader({
  query,
  sort,
  label,
  align = 'right',
}: {
  query: AdminUsageQuery;
  sort: AdminUsageSort;
  label: string;
  align?: 'left' | 'right';
}) {
  const active = query.sort === sort;
  const nextDirection = active && query.direction === 'desc' ? 'asc' : 'desc';

  return (
    <th
      scope="col"
      aria-sort={active ? (query.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={`px-4 py-0 font-medium ${align === 'right' ? 'text-right' : 'text-left'}`}
    >
      <Link
        href={buildAdminHref(query, { sort, direction: nextDirection, page: 1 })}
        prefetch={false}
        className={`inline-flex min-h-11 items-center gap-1 py-2 text-xs text-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground ${align === 'right' ? 'justify-end' : ''}`}
      >
        {label}
        {active ? <span aria-hidden="true">{query.direction === 'asc' ? '↑' : '↓'}</span> : null}
      </Link>
    </th>
  );
}

function UserIdentity({ user }: { user: AdminUsageUser }) {
  return (
    <span className="block min-w-48">
      <span className="block break-all font-medium text-foreground">
        {user.email ?? 'Email unavailable'}
      </span>
      <code className="mt-1 block break-all text-[11px] text-muted">{user.id}</code>
      {user.providerCalls === BigInt(0) ? (
        <span className="mt-2 inline-block rounded-full border border-border-subtle px-2 py-0.5 text-xs text-muted">
          No activity
        </span>
      ) : null}
    </span>
  );
}

function UserTable({ dashboard }: { dashboard: AdminUsageDashboardData }) {
  const { query, users } = dashboard;
  const totalPagesBig = users.totalUsers === BigInt(0)
    ? BigInt(1)
    : (users.totalUsers + BigInt(users.pageSize - 1)) / BigInt(users.pageSize);
  const totalPages = Number(
    totalPagesBig > BigInt(10_000) ? BigInt(10_000) : totalPagesBig
  );

  return (
    <>
      {users.items.length === 0 ? (
        <div className="border-y border-border-subtle py-9 text-center font-sans">
          <p className="text-sm font-medium text-foreground">
            {users.totalUsers === BigInt(0)
              ? 'No registered users'
              : 'No users on this page'}
          </p>
          <p className="mt-1 text-sm text-muted">
            {users.totalUsers === BigInt(0)
              ? 'Registered beta accounts will appear here.'
              : 'Choose an earlier page to continue browsing registered users.'}
          </p>
        </div>
      ) : (
        <TableFrame label="Per-user usage and estimated cost table">
          <table className="w-full min-w-[92rem] border-collapse font-sans text-sm">
            <thead>
              <tr className="border-b border-border-subtle text-muted">
                <SortHeader query={query} sort="email" label="User" align="left" />
                <SortHeader query={query} sort="joined_at" label="Joined" />
                <SortHeader query={query} sort="last_active" label="Last active" />
                <SortHeader query={query} sort="responses" label="Responses" />
                <SortHeader query={query} sort="provider_calls" label="Provider calls" />
                <SortHeader query={query} sort="total_tokens" label="Tokens" align="left" />
                <SortHeader query={query} sort="estimated_cost" label="Total cost" />
                <th scope="col" className="px-4 py-3 text-right text-xs font-medium">
                  Avg. chat cost
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium">
                  Model preferences
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium">
                  Coverage
                </th>
              </tr>
            </thead>
            <tbody>
              {users.items.map((user) => (
                <tr key={user.id} className="border-b border-border-subtle last:border-0">
                  <th scope="row" className="px-4 py-4 text-left align-top font-normal">
                    <UserIdentity user={user} />
                  </th>
                  <td className="px-4 py-4 text-right align-top whitespace-nowrap">
                    {formatDate(user.joinedAt)}
                  </td>
                  <td className="px-4 py-4 text-right align-top whitespace-nowrap">
                    {formatDate(user.lastActiveAt)}
                  </td>
                  <td className="px-4 py-4 text-right align-top tabular-nums">
                    {formatInteger(user.responses)}
                  </td>
                  <td className="px-4 py-4 text-right align-top tabular-nums">
                    {formatInteger(user.providerCalls)}
                  </td>
                  <td className="px-4 py-4 align-top">
                    <TokenSummary {...user.tokens} />
                  </td>
                  <td className="px-4 py-4 text-right align-top">
                    <CostValue
                      value={user.estimatedCostNanousd}
                      isPartial={user.coverage.pricedCalls < user.coverage.billableUsageCalls}
                    />
                  </td>
                  <td className="px-4 py-4 text-right align-top tabular-nums">
                    {user.responses === BigInt(0)
                      ? 'No responses'
                      : formatCost(user.averageChatCostNanousd)}
                  </td>
                  <td className="px-4 py-4 align-top text-xs leading-5">
                    <span className="block">
                      <span className="text-muted">Requested:</span>{' '}
                      {user.mostRequestedModelId ?? 'Unavailable'}
                    </span>
                    <span className="block">
                      <span className="text-muted">Resolved:</span>{' '}
                      {user.mostResolvedModelId ?? 'Unavailable'}
                    </span>
                  </td>
                  <td className="px-4 py-4 align-top text-xs leading-5">
                    <span className="block">
                      Usage: {formatCoverage(
                        user.coverage.usageReportedCalls,
                        user.coverage.completedCalls
                      )}
                    </span>
                    <span className="block">
                      Pricing: {formatCoverage(
                        user.coverage.pricedCalls,
                        user.coverage.billableUsageCalls
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableFrame>
      )}

      <nav
        aria-label="User table pagination"
        className="mt-4 flex flex-wrap items-center justify-between gap-3 font-sans text-sm"
      >
        <p className="text-muted">
          Page {query.page} of {totalPages} · {formatInteger(users.totalUsers)} users
        </p>
        <div className="flex items-center gap-2">
          {query.page > 1 ? (
            <Link
              href={buildAdminHref(query, { page: query.page - 1 })}
              prefetch={false}
              className="inline-flex min-h-11 items-center rounded-lg border border-border-subtle px-4 text-foreground hover:bg-foreground/[0.04] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
            >
              Previous
            </Link>
          ) : (
            <span className="inline-flex min-h-11 items-center rounded-lg border border-border-subtle px-4 text-muted/60">
              Previous
            </span>
          )}
          {query.page < totalPages ? (
            <Link
              href={buildAdminHref(query, { page: query.page + 1 })}
              prefetch={false}
              className="inline-flex min-h-11 items-center rounded-lg border border-border-subtle px-4 text-foreground hover:bg-foreground/[0.04] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
            >
              Next
            </Link>
          ) : (
            <span className="inline-flex min-h-11 items-center rounded-lg border border-border-subtle px-4 text-muted/60">
              Next
            </span>
          )}
        </div>
      </nav>
    </>
  );
}

function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-[100dvh] bg-background text-foreground"
      style={{
        '--muted': 'color-mix(in srgb, var(--foreground) 68%, var(--background))',
      } as CSSProperties}
    >
      <header className="border-b border-border-subtle">
        <div className="mx-auto flex w-full max-w-[96rem] flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 sm:flex-nowrap sm:px-7 lg:px-10">
          <OrchardBrand />
          <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-end">
            <Link
              href="/home"
              className="inline-flex min-h-11 items-center rounded-lg px-3 font-sans text-sm text-muted hover:bg-foreground/[0.04] hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
            >
              Back to chats
            </Link>
            <div className="[&>button]:focus-visible:ring-2 [&>button]:focus-visible:ring-foreground">
              <ThemePicker />
            </div>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}

export function AdminDashboard({
  dashboard,
  refreshedAt,
}: {
  dashboard: AdminUsageDashboardData;
  refreshedAt: Date;
}) {
  const { overview, query } = dashboard;
  const usageCoverage = formatCoverage(
    overview.coverage.usageReportedCalls,
    overview.coverage.completedCalls
  );
  const pricingCoverage = formatCoverage(
    overview.coverage.pricedCalls,
    overview.coverage.billableUsageCalls
  );
  const partialPricing = overview.coverage.missingPriceCalls > BigInt(0);
  const hasUsageGaps = overview.coverage.missingUsageCalls > BigInt(0);

  return (
    <AdminShell>
      <main className="mx-auto w-full max-w-[96rem] px-4 py-8 sm:px-7 sm:py-10 lg:px-10 lg:py-12">
        <div className="flex flex-col gap-6 border-b border-border-subtle pb-8 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="font-heading text-4xl leading-tight sm:text-5xl">Usage telemetry</h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-muted">
              Content-free model usage, model selection, and estimated cost across Orchard’s
              beta accounts.
            </p>
            <p className="mt-3 font-sans text-xs text-muted">
              Tracking begins at telemetry launch; historical usage is not reconstructed.
              {' '}Last refreshed{' '}
              <LocalizedDate
                value={refreshedAt.toISOString()}
                fallback={timestampFormatter.format(refreshedAt)}
                includeTime
              />.
            </p>
          </div>
          <nav aria-label="Usage date range" className="flex flex-wrap gap-1 rounded-xl bg-foreground/[0.035] p-1 font-sans">
            {Object.entries(rangeLabels).map(([range, label]) => {
              const selected = query.preset === range;
              return (
                <Link
                  key={range}
                  href={buildAdminHref(query, {
                    range: range as AdminUsageQuery['preset'],
                    page: 1,
                  })}
                  prefetch={false}
                  aria-current={selected ? 'page' : undefined}
                  className={`inline-flex min-h-11 items-center rounded-lg px-4 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground ${
                    selected
                      ? 'bg-surface font-medium text-foreground shadow-sm'
                      : 'text-muted hover:text-foreground'
                  }`}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>

        {query.filtersNormalized ? (
          <div className="mt-6">
            <StatusNotice title="Some filters were reset">
              Unsupported URL values were replaced with safe dashboard defaults.
            </StatusNotice>
          </div>
        ) : null}

        {overview.providerCalls === BigInt(0) ? (
          <div className="mt-6">
            <StatusNotice title="No model usage in this period">
              {overview.registeredUsers === BigInt(0)
                ? 'No beta accounts are registered yet.'
                : `${formatInteger(overview.registeredUsers)} registered users remain visible in the user table.`}
            </StatusNotice>
          </div>
        ) : null}

        {partialPricing || hasUsageGaps ? (
          <div className="mt-6">
            <StatusNotice title="Some totals are incomplete">
              {hasUsageGaps
                ? `${formatInteger(overview.coverage.missingUsageCalls)} calls do not report complete usage. `
                : ''}
              {partialPricing
                ? `${formatInteger(overview.coverage.missingPriceCalls)} calls have usage but no registered price.`
                : ''}
            </StatusNotice>
          </div>
        ) : null}

        <section aria-labelledby="summary-heading" className="mt-10">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 id="summary-heading" className="font-heading text-2xl">Summary</h2>
            <p className="font-sans text-xs text-muted">{rangeLabels[query.preset]}</p>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-x-5 border-y border-border-subtle sm:grid-cols-4 xl:grid-cols-7">
            <Metric label="Registered users" value={formatInteger(overview.registeredUsers)} />
            <Metric label="Active users" value={formatInteger(overview.activeUsers)} />
            <Metric label="Responses" value={formatInteger(overview.responses)} />
            <Metric label="Provider calls" value={formatInteger(overview.providerCalls)} />
            <Metric
              label="Total tokens"
              value={overview.providerCalls === BigInt(0)
                ? 'No usage'
                : formatCompact(overview.tokens.total)}
            />
            <Metric
              label="Estimated LLM cost"
              value={overview.providerCalls === BigInt(0)
                ? 'No usage'
                : formatCost(overview.estimatedCostNanousd)}
              detail={partialPricing ? 'Partial pricing' : undefined}
            />
            <Metric
              label="Average chat cost"
              value={overview.responses === BigInt(0)
                ? 'No responses'
                : formatCost(overview.averageChatCostNanousd)}
              detail="Per user-initiated response"
            />
          </dl>
          <div className="mt-4 flex flex-wrap gap-x-7 gap-y-2 font-sans text-xs text-muted">
            <span>Usage reporting: {usageCoverage}</span>
            <span>Pricing coverage: {pricingCoverage}</span>
            <span>
              Cost includes model calls for responses, titles, search planning, retries, and
              mentor generation.
            </span>
            <span>Brave, Exa, Deepgram, and TTS are excluded.</span>
          </div>
        </section>

        <section aria-labelledby="activity-heading" className="mt-14">
          <div className="mb-5">
            <h2 id="activity-heading" className="font-heading text-2xl">Daily activity</h2>
            <p className="mt-1 font-sans text-sm text-muted">
              User-initiated responses beside the priced portion of estimated model cost.
            </p>
          </div>
          <div
            tabIndex={0}
            role="region"
            aria-label="Scrollable daily activity chart"
            className="overflow-x-auto pb-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
          >
            <DailyActivity dashboard={dashboard} />
          </div>
        </section>

        <section aria-labelledby="models-heading" className="mt-14">
          <div className="mb-5">
            <h2 id="models-heading" className="font-heading text-2xl">Resolved model usage</h2>
            <p className="mt-1 max-w-3xl font-sans text-sm leading-6 text-muted">
              Primary response counts and Auto selection are reported separately from
              auxiliary provider calls.
            </p>
          </div>
          <ModelTable models={dashboard.models} />
        </section>

        <section aria-labelledby="users-heading" className="mt-14">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="users-heading" className="font-heading text-2xl">Users</h2>
              <p className="mt-1 max-w-3xl font-sans text-sm leading-6 text-muted">
                Aggregate usage only. Email is profile display metadata; the Supabase user ID
                remains canonical.
              </p>
            </div>
            <p className="font-sans text-xs text-muted">
              Sorted by {query.sort.replaceAll('_', ' ')} {query.direction}
            </p>
          </div>
          <UserTable dashboard={dashboard} />
        </section>
      </main>
    </AdminShell>
  );
}

export function AdminDashboardError({ retryHref }: { retryHref: string }) {
  return (
    <AdminShell>
      <main className="mx-auto flex min-h-[70dvh] w-full max-w-3xl items-center px-5 py-16">
        <div>
          <h1 className="font-heading text-4xl">Usage data is unavailable</h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-muted">
            The aggregate query could not be completed. No raw telemetry was exposed.
            Try the request again; if it continues to fail, verify the server-only Supabase
            configuration and database migration health.
          </p>
          <Link
            href={retryHref}
            prefetch={false}
            className="mt-7 inline-flex min-h-11 items-center rounded-lg bg-foreground px-5 font-sans text-sm font-medium text-background hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
          >
            Try again
          </Link>
        </div>
      </main>
    </AdminShell>
  );
}

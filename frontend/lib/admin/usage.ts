import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  isAdminAuthorization,
  type AdminAuthorization,
} from '@/lib/admin/authorization';

export const ADMIN_USAGE_PRESETS = ['7d', '30d', 'all'] as const;
export const ADMIN_USAGE_SORTS = [
  'estimated_cost',
  'responses',
  'provider_calls',
  'total_tokens',
  'last_active',
  'joined_at',
  'email',
] as const;
export const ADMIN_USAGE_DIRECTIONS = ['asc', 'desc'] as const;

export type AdminUsagePreset = typeof ADMIN_USAGE_PRESETS[number];
export type AdminUsageSort = typeof ADMIN_USAGE_SORTS[number];
export type AdminUsageDirection = typeof ADMIN_USAGE_DIRECTIONS[number];

export interface AdminUsageQuery {
  preset: AdminUsagePreset;
  sort: AdminUsageSort;
  direction: AdminUsageDirection;
  page: number;
  pageSize: number;
  start: string;
  end: string;
}

export interface AdminUsageOverview {
  registeredUsers: bigint;
  activeUsers: bigint;
  responses: bigint;
  providerCalls: bigint;
  tokens: {
    input: bigint | null;
    cacheRead: bigint | null;
    output: bigint | null;
    reasoning: bigint | null;
    total: bigint | null;
  };
  estimatedCostNanousd: bigint | null;
  estimatedChatCostNanousd: bigint | null;
  averageChatCostNanousd: bigint | null;
  coverage: {
    completedCalls: bigint;
    usageReportedCalls: bigint;
    billableUsageCalls: bigint;
    pricedCalls: bigint;
    missingUsageCalls: bigint;
    missingPriceCalls: bigint;
  };
}

export interface AdminUsageDailyPoint {
  date: string;
  responses: bigint;
  providerCalls: bigint;
  totalTokens: bigint | null;
  estimatedCostNanousd: bigint | null;
  missingUsageCalls: bigint;
  missingPriceCalls: bigint;
}

export interface AdminUsageModel {
  key: string;
  resolvedModelId: string | null;
  provider: string;
  providerModelId: string;
  primaryResponses: bigint;
  auxiliaryCalls: bigint;
  distinctUsers: bigint;
  autoRequestedResponses: bigint;
  tokens: {
    input: bigint | null;
    cacheRead: bigint | null;
    output: bigint | null;
    reasoning: bigint | null;
    total: bigint | null;
  };
  estimatedCostNanousd: bigint | null;
  failedCalls: bigint;
  billableUsageCalls: bigint;
  pricedCalls: bigint;
}

export interface AdminUsageUser {
  id: string;
  email: string | null;
  joinedAt: string;
  lastActiveAt: string | null;
  responses: bigint;
  providerCalls: bigint;
  tokens: {
    input: bigint | null;
    cacheRead: bigint | null;
    output: bigint | null;
    reasoning: bigint | null;
    total: bigint | null;
  };
  estimatedCostNanousd: bigint | null;
  averageChatCostNanousd: bigint | null;
  mostRequestedModelId: string | null;
  mostResolvedModelId: string | null;
  coverage: {
    completedCalls: bigint;
    usageReportedCalls: bigint;
    billableUsageCalls: bigint;
    pricedCalls: bigint;
    missingPriceCalls: bigint;
  };
}

export interface AdminUsageDashboard {
  query: AdminUsageQuery;
  overview: AdminUsageOverview;
  daily: AdminUsageDailyPoint[];
  models: AdminUsageModel[];
  users: {
    totalUsers: bigint;
    page: number;
    pageSize: number;
    items: AdminUsageUser[];
  };
}

type RpcError = { message?: string } | null;
type RpcResult = { data: unknown; error: RpcError };
type AdminRpcClient = Pick<SupabaseClient, 'rpc'>;
type Row = Record<string, unknown>;

let adminClient: AdminRpcClient | null = null;

function getAdminClient(): AdminRpcClient {
  if (adminClient) return adminClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error('admin_usage_unavailable');
  }

  adminClient = createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  return adminClient;
}

function isOneOf<const T extends readonly string[]>(
  value: unknown,
  choices: T
): value is T[number] {
  return typeof value === 'string' && choices.includes(value);
}

function parsePositiveInteger(value: unknown, fallback: number, maximum: number) {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= maximum ? parsed : fallback;
}

function nextUtcDay(now: Date) {
  return new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1
  ));
}

export function parseAdminUsageQuery(
  input: Record<string, unknown>,
  now = new Date()
): AdminUsageQuery {
  if (!Number.isFinite(now.getTime())) throw new Error('invalid_admin_usage_clock');

  const preset = isOneOf(input.range, ADMIN_USAGE_PRESETS) ? input.range : '30d';
  const sort = isOneOf(input.sort, ADMIN_USAGE_SORTS) ? input.sort : 'estimated_cost';
  const direction =
    isOneOf(input.direction, ADMIN_USAGE_DIRECTIONS) ? input.direction : 'desc';
  const page = parsePositiveInteger(input.page, 1, 10_000);
  const pageSize = parsePositiveInteger(input.pageSize, 25, 100);
  const end = nextUtcDay(now);
  const start = preset === 'all'
    ? new Date(0)
    : new Date(end.getTime() - (preset === '7d' ? 7 : 30) * 86_400_000);

  return {
    preset,
    sort,
    direction,
    page,
    pageSize,
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

function requireRows(data: unknown, source: string): Row[] {
  if (!Array.isArray(data) || data.some((row) => !row || typeof row !== 'object')) {
    throw new Error(`invalid_admin_usage_${source}`);
  }
  return data as Row[];
}

function requiredText(row: Row, key: string) {
  const value = row[key];
  if (typeof value !== 'string' || !value) throw new Error('invalid_admin_usage_result');
  return value;
}

function nullableText(row: Row, key: string) {
  const value = row[key];
  if (value === null) return null;
  return requiredText(row, key);
}

function parseBigIntValue(value: unknown, nullable: boolean) {
  if (value === null && nullable) return null;
  const text = typeof value === 'number' && Number.isSafeInteger(value)
    ? String(value)
    : typeof value === 'string'
      ? value
      : '';
  if (!/^\d+$/.test(text)) throw new Error('invalid_admin_usage_result');
  return BigInt(text);
}

function requiredBigInt(row: Row, key: string) {
  return parseBigIntValue(row[key], false) as bigint;
}

function nullableBigInt(row: Row, key: string) {
  return parseBigIntValue(row[key], true);
}

function nullableRoundedBigInt(row: Row, key: string) {
  const value = row[key];
  if (value === null) return null;
  const text = typeof value === 'number' ? String(value) : value;
  if (typeof text !== 'string' || !/^\d+(?:\.\d+)?$/.test(text)) {
    throw new Error('invalid_admin_usage_result');
  }
  const [whole, fraction = ''] = text.split('.');
  return BigInt(whole) + (fraction[0] && fraction[0] >= '5' ? BigInt(1) : BigInt(0));
}

function tokenBreakdown(row: Row) {
  return {
    input: nullableBigInt(row, 'input_tokens'),
    cacheRead: nullableBigInt(row, 'cache_read_tokens'),
    output: nullableBigInt(row, 'output_tokens'),
    reasoning: nullableBigInt(row, 'reasoning_tokens'),
    total: nullableBigInt(row, 'total_tokens'),
  };
}

function mapOverview(data: unknown): AdminUsageOverview {
  const rows = requireRows(data, 'overview');
  if (rows.length !== 1) throw new Error('invalid_admin_usage_overview');
  const row = rows[0];

  return {
    registeredUsers: requiredBigInt(row, 'registered_users'),
    activeUsers: requiredBigInt(row, 'active_users'),
    responses: requiredBigInt(row, 'responses'),
    providerCalls: requiredBigInt(row, 'provider_calls'),
    tokens: tokenBreakdown(row),
    estimatedCostNanousd: nullableBigInt(row, 'estimated_cost_nanousd'),
    estimatedChatCostNanousd: nullableBigInt(row, 'estimated_chat_cost_nanousd'),
    averageChatCostNanousd: nullableRoundedBigInt(row, 'average_chat_cost_nanousd'),
    coverage: {
      completedCalls: requiredBigInt(row, 'completed_calls'),
      usageReportedCalls: requiredBigInt(row, 'usage_reported_calls'),
      billableUsageCalls: requiredBigInt(row, 'billable_usage_calls'),
      pricedCalls: requiredBigInt(row, 'priced_calls'),
      missingUsageCalls: requiredBigInt(row, 'missing_usage_calls'),
      missingPriceCalls: requiredBigInt(row, 'missing_price_calls'),
    },
  };
}

function mapDaily(data: unknown): AdminUsageDailyPoint[] {
  return requireRows(data, 'daily').map((row) => ({
    date: requiredText(row, 'usage_day'),
    responses: requiredBigInt(row, 'responses'),
    providerCalls: requiredBigInt(row, 'provider_calls'),
    totalTokens: nullableBigInt(row, 'total_tokens'),
    estimatedCostNanousd: nullableBigInt(row, 'estimated_cost_nanousd'),
    missingUsageCalls: requiredBigInt(row, 'missing_usage_calls'),
    missingPriceCalls: requiredBigInt(row, 'missing_price_calls'),
  }));
}

function mapModels(data: unknown): AdminUsageModel[] {
  return requireRows(data, 'models').map((row) => ({
    key: requiredText(row, 'model_key'),
    resolvedModelId: nullableText(row, 'resolved_model_id'),
    provider: requiredText(row, 'provider'),
    providerModelId: requiredText(row, 'provider_model_id'),
    primaryResponses: requiredBigInt(row, 'primary_responses'),
    auxiliaryCalls: requiredBigInt(row, 'auxiliary_calls'),
    distinctUsers: requiredBigInt(row, 'distinct_users'),
    autoRequestedResponses: requiredBigInt(row, 'auto_requested_responses'),
    tokens: tokenBreakdown(row),
    estimatedCostNanousd: nullableBigInt(row, 'estimated_cost_nanousd'),
    failedCalls: requiredBigInt(row, 'failed_calls'),
    billableUsageCalls: requiredBigInt(row, 'billable_usage_calls'),
    pricedCalls: requiredBigInt(row, 'priced_calls'),
  }));
}

function mapUsers(data: unknown): AdminUsageUser[] {
  return requireRows(data, 'users').map((row) => ({
    id: requiredText(row, 'user_id'),
    email: nullableText(row, 'email'),
    joinedAt: requiredText(row, 'joined_at'),
    lastActiveAt: nullableText(row, 'last_active_at'),
    responses: requiredBigInt(row, 'responses'),
    providerCalls: requiredBigInt(row, 'provider_calls'),
    tokens: tokenBreakdown(row),
    estimatedCostNanousd: nullableBigInt(row, 'estimated_cost_nanousd'),
    averageChatCostNanousd: nullableRoundedBigInt(row, 'average_chat_cost_nanousd'),
    mostRequestedModelId: nullableText(row, 'most_requested_model_id'),
    mostResolvedModelId: nullableText(row, 'most_resolved_model_id'),
    coverage: {
      completedCalls: requiredBigInt(row, 'completed_calls'),
      usageReportedCalls: requiredBigInt(row, 'usage_reported_calls'),
      billableUsageCalls: requiredBigInt(row, 'billable_usage_calls'),
      pricedCalls: requiredBigInt(row, 'priced_calls'),
      missingPriceCalls: requiredBigInt(row, 'missing_price_calls'),
    },
  }));
}

async function runRpc(
  client: AdminRpcClient,
  name: string,
  args: Record<string, unknown>
) {
  const { data, error } = await client.rpc(name, args) as RpcResult;
  if (error) throw new Error(`admin_usage_${name}_failed`);
  return data;
}

export async function loadAdminUsageDashboard(
  authorization: AdminAuthorization,
  input: Record<string, unknown>,
  now = new Date()
): Promise<AdminUsageDashboard> {
  if (!isAdminAuthorization(authorization)) {
    throw new Error('admin_authorization_required');
  }

  const query = parseAdminUsageQuery(input, now);
  const client = getAdminClient();
  const interval = {
    p_start: query.start,
    p_end: query.end,
  };
  const [overviewData, dailyData, modelsData, usersData] = await Promise.all([
    runRpc(client, 'admin_model_usage_overview', interval),
    runRpc(client, 'admin_model_usage_daily', interval),
    runRpc(client, 'admin_model_usage_models', interval),
    runRpc(client, 'admin_model_usage_users', {
      ...interval,
      p_sort: query.sort,
      p_direction: query.direction,
      p_limit: query.pageSize,
      p_offset: (query.page - 1) * query.pageSize,
    }),
  ]);
  const overview = mapOverview(overviewData);

  return {
    query,
    overview,
    daily: mapDaily(dailyData),
    models: mapModels(modelsData),
    users: {
      totalUsers: overview.registeredUsers,
      page: query.page,
      pageSize: query.pageSize,
      items: mapUsers(usersData),
    },
  };
}

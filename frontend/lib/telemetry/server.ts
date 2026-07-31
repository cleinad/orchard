import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { calculateModelCost } from '@/lib/telemetry/model-pricing';
import {
  normalizeModelUsage,
  sanitizeFinishReason,
  type NormalizedModelUsage,
} from '@/lib/telemetry/model-usage';
import type { LanguageModelUsage } from 'ai';

export type ModelUsageCallKind =
  | 'chat_response'
  | 'chat_response_retry'
  | 'conversation_title'
  | 'search_decision'
  | 'search_plan'
  | 'mentor_generation';

export type ModelUsageSurface = 'main' | 'branch' | 'inline_thread' | 'mentor';
export type ModelUsageStatus = 'completed' | 'failed' | 'cancelled' | 'interrupted';

export interface ModelUsageCallContext {
  id: string;
  userId: string;
  requestId: string;
  runId?: string | null;
  callKind: ModelUsageCallKind;
  attempt: number;
  chatMode?: 'persistent' | 'temporary' | null;
  surface: ModelUsageSurface;
  requestedModelId?: string | null;
  resolvedModelId?: string | null;
  provider: string;
  providerModelId: string;
  startedAt: Date;
}

export interface ModelUsageTerminal {
  status: ModelUsageStatus;
  finishReason?: unknown;
  usage?: LanguageModelUsage | null;
  completedAt?: Date;
}

export interface ModelUsageCallRow {
  id: string;
  user_id: string;
  request_id: string;
  run_id: string | null;
  call_kind: ModelUsageCallKind;
  attempt: number;
  chat_mode: 'persistent' | 'temporary' | null;
  surface: ModelUsageSurface;
  requested_model_id: string | null;
  resolved_model_id: string | null;
  provider: string;
  provider_model_id: string;
  status: ModelUsageStatus;
  finish_reason: string | null;
  input_tokens: number | null;
  no_cache_input_tokens: number | null;
  cache_read_tokens: number | null;
  cache_write_tokens: number | null;
  output_tokens: number | null;
  reasoning_tokens: number | null;
  total_tokens: number | null;
  duration_ms: number;
  estimated_cost_nanousd: string | null;
  pricing_version: string | null;
  cost_status: 'priced' | 'missing_usage' | 'missing_price' | 'failed_before_usage';
  started_at: string;
  completed_at: string;
}

type UsageInsertClient = Pick<SupabaseClient, 'from'>;
let telemetryClient: SupabaseClient | null = null;

function nullable(value: number | undefined) {
  return value ?? null;
}

function sanitizeTelemetryIdentifier(value: string) {
  return value.replace(/[^a-zA-Z0-9._:/-]/g, '?').slice(0, 100);
}

function getTelemetryClient() {
  if (telemetryClient) return telemetryClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;

  telemetryClient = createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  return telemetryClient;
}

export function startModelUsageCall(
  context: Omit<ModelUsageCallContext, 'id' | 'startedAt'>
): ModelUsageCallContext {
  return {
    ...context,
    id: crypto.randomUUID(),
    startedAt: new Date(),
  };
}

export function buildModelUsageCallRow(
  context: ModelUsageCallContext,
  terminal: ModelUsageTerminal
): ModelUsageCallRow {
  const completedAt = terminal.completedAt ?? new Date();
  const usage = normalizeModelUsage(terminal.usage);
  const cost = calculateModelCost({
    provider: context.provider,
    providerModelId: context.providerModelId,
    usage,
    startedAt: context.startedAt,
  });
  const failedBeforeUsage = terminal.status !== 'completed' && cost.status === 'missing_usage';

  return {
    id: context.id,
    user_id: context.userId,
    request_id: context.requestId,
    run_id: context.runId ?? null,
    call_kind: context.callKind,
    attempt: context.attempt,
    chat_mode: context.surface === 'mentor' ? null : context.chatMode ?? null,
    surface: context.surface,
    requested_model_id: context.requestedModelId ?? null,
    resolved_model_id: context.resolvedModelId ?? null,
    provider: context.provider,
    provider_model_id: context.providerModelId,
    status: terminal.status,
    finish_reason: sanitizeFinishReason(terminal.finishReason) ?? null,
    input_tokens: nullable(usage.inputTokens),
    no_cache_input_tokens: nullable(usage.noCacheInputTokens),
    cache_read_tokens: nullable(usage.cacheReadTokens),
    cache_write_tokens: nullable(usage.cacheWriteTokens),
    output_tokens: nullable(usage.outputTokens),
    reasoning_tokens: nullable(usage.reasoningTokens),
    total_tokens: nullable(usage.totalTokens),
    duration_ms: Math.max(0, completedAt.getTime() - context.startedAt.getTime()),
    estimated_cost_nanousd:
      cost.status === 'priced' ? cost.estimatedCostNanousd.toString() : null,
    pricing_version: cost.status === 'priced' ? cost.pricingVersion : null,
    cost_status: failedBeforeUsage ? 'failed_before_usage' : cost.status,
    started_at: context.startedAt.toISOString(),
    completed_at: completedAt.toISOString(),
  };
}

function withTimeout<T>(promise: PromiseLike<T>, timeoutMs: number) {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<never>((_, reject) => {
      const timeout = setTimeout(() => reject(new Error('telemetry_timeout')), timeoutMs);
      timeout.unref?.();
    }),
  ]);
}

export async function writeModelUsageCall(
  row: ModelUsageCallRow,
  options: { client?: UsageInsertClient; timeoutMs?: number } = {}
) {
  const client = options.client ?? getTelemetryClient();
  if (!client) {
    console.error('[telemetry] terminal insert unavailable', { code: 'missing_configuration' });
    return false;
  }

  const timeoutMs = options.timeoutMs ?? 250;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const { error } = await withTimeout(
        client
          .from('model_usage_calls')
          .upsert(row, { onConflict: 'id', ignoreDuplicates: true }),
        timeoutMs
      );
      if (!error) return true;
    } catch {
      // The bounded retry below uses the same provider-call ID.
    }
  }

  console.error('[telemetry] terminal insert failed', { code: 'write_failed' });
  return false;
}

export async function recordModelUsageCall(
  context: ModelUsageCallContext,
  terminal: ModelUsageTerminal
) {
  try {
    const row = buildModelUsageCallRow(context, terminal);
    if (row.cost_status === 'missing_price') {
      console.warn('[telemetry] model price unavailable', {
        code: 'missing_price',
        provider: sanitizeTelemetryIdentifier(row.provider),
        providerModelId: sanitizeTelemetryIdentifier(row.provider_model_id),
      });
    }
    return await writeModelUsageCall(row);
  } catch {
    console.error('[telemetry] terminal row rejected', { code: 'invalid_usage' });
    return false;
  }
}

export function normalizeUsageForTelemetry(
  usage: LanguageModelUsage | null | undefined
): NormalizedModelUsage {
  return normalizeModelUsage(usage);
}

import type {
  ChatRunSnapshot,
  ChatRunTarget,
  ChatRunTitleSource,
} from '@/lib/chat-runs/protocol';
import { getChatRunScopeKey } from '@/lib/chat-runs/protocol';
import { isUuid } from '@/lib/chat-session';
import type { createSupabaseServerClient } from '@/lib/supabase-server';

type SupabaseLike = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export interface ChatRunRequestMetadata {
  runId: string;
  userMessageId: string;
  assistantMessageId: string;
  temporarySessionId?: string;
  newThreadId?: string;
  newBranchId?: string;
  target?: Partial<ChatRunTarget>;
  createConversation?: boolean;
}

export interface AcceptedChatRun {
  disposition:
    | 'accepted'
    | 'reattach'
    | 'payload_conflict'
    | 'active_conflict'
    | 'invalid_target'
    | 'unauthorized';
  runId?: string;
  status?: string;
  code?: string;
}

interface ChatRunDatabaseRow {
  id: string;
  target: unknown;
  user_message_id: string;
  assistant_message_id: string;
  created_thread_id?: string | null;
  created_branch_id?: string | null;
  status: ChatRunSnapshot['status'];
  response_status: ChatRunSnapshot['subsystems']['response'];
  title_status: ChatRunSnapshot['subsystems']['title'];
  search_status: ChatRunSnapshot['subsystems']['search'];
  response_text?: string | null;
  search_metadata?: ChatRunSnapshot['search'];
  search_activity?: ChatRunSnapshot['searchActivity'];
  title?: string | null;
  title_source?: ChatRunTitleSource;
  title_version?: number;
  error_code?: string | null;
  error_message?: string | null;
  accepted_at: string;
  updated_at: string;
  completed_at?: string | null;
}

const RUN_FIELDS = [
  'id',
  'target',
  'user_message_id',
  'assistant_message_id',
  'created_thread_id',
  'created_branch_id',
  'status',
  'response_status',
  'title_status',
  'search_status',
  'response_text',
  'search_metadata',
  'search_activity',
  'title',
  'title_source',
  'title_version',
  'error_code',
  'error_message',
  'accepted_at',
  'updated_at',
  'completed_at',
].join(', ');

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => [key, canonicalize(entry)])
  );
}

export async function hashChatRunPayload(payload: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(canonicalize(payload)));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function validateChatRunMetadata(
  value: ChatRunRequestMetadata | undefined
): string | null {
  if (!value) return 'Run metadata is required';
  if (
    value.createConversation != null
    && typeof value.createConversation !== 'boolean'
  ) return 'createConversation must be a boolean';
  for (const [label, id] of [
    ['runId', value.runId],
    ['userMessageId', value.userMessageId],
    ['assistantMessageId', value.assistantMessageId],
  ]) {
    if (!isUuid(id)) return `${label} must be a UUID`;
  }
  if (
    value.temporarySessionId != null
    && (value.temporarySessionId.length === 0 || value.temporarySessionId.length > 128)
  ) {
    return 'temporarySessionId is invalid';
  }
  for (const [label, id] of [
    ['newThreadId', value.newThreadId],
    ['newBranchId', value.newBranchId],
  ]) {
    if (id != null && !isUuid(id)) return `${label} must be a UUID`;
  }
  return null;
}

export async function acceptChatRun(params: {
  supabase: SupabaseLike;
  metadata: ChatRunRequestMetadata;
  target: ChatRunTarget;
  payload: unknown;
  fallbackTitle: string;
}): Promise<AcceptedChatRun> {
  const requestHash = await hashChatRunPayload(params.payload);
  const { data, error } = await params.supabase.rpc('accept_chat_run', {
    p_run_id: params.metadata.runId,
    p_request_hash: requestHash,
    p_scope_key: getChatRunScopeKey(params.target),
    p_target: params.target,
    p_conversation_id: params.target.conversationId,
    p_user_message_id: params.metadata.userMessageId,
    p_assistant_message_id: params.metadata.assistantMessageId,
    p_created_thread_id: params.metadata.newThreadId ?? null,
    p_created_branch_id: params.metadata.newBranchId ?? null,
    p_fallback_title: params.fallbackTitle,
  });
  if (error) throw new Error(error.message || 'Failed to accept chat run');
  const result = data as {
    disposition: AcceptedChatRun['disposition'];
    run_id?: string;
    status?: string;
    code?: string;
  };
  return {
    disposition: result.disposition,
    runId: result.run_id,
    status: result.status,
    code: result.code,
  };
}

function normalizeTarget(value: unknown): ChatRunTarget {
  return value as ChatRunTarget;
}

export function mapChatRunRow(row: ChatRunDatabaseRow): ChatRunSnapshot {
  return {
    runId: row.id,
    mode: 'persistent',
    status: row.status,
    target: normalizeTarget(row.target),
    userMessageId: row.user_message_id,
    assistantMessageId: row.assistant_message_id,
    createdThreadId: row.created_thread_id ?? null,
    createdBranchId: row.created_branch_id ?? null,
    response: row.response_text ?? null,
    search: row.search_metadata ?? null,
    searchActivity: row.search_activity ?? null,
    title: {
      value: row.title ?? null,
      source: (row.title_source ?? 'fallback') as ChatRunTitleSource,
      version: row.title_version ?? 0,
      runId: row.id,
    },
    subsystems: {
      response: row.response_status,
      title: row.title_status,
      search: row.search_status,
    },
    errorCode: row.error_code ?? null,
    errorMessage: row.error_message ?? null,
    acceptedAt: row.accepted_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at ?? null,
    expiresAt: null,
  };
}

export async function getChatRun(
  supabase: SupabaseLike,
  runId: string
): Promise<ChatRunSnapshot | null> {
  const persistent = await supabase
    .from('chat_runs')
    .select(RUN_FIELDS)
    .eq('id', runId)
    .maybeSingle();
  if (persistent.error) {
    throw new Error(persistent.error.message || 'Failed to load chat run');
  }
  if (persistent.data) {
    return mapChatRunRow(persistent.data as unknown as ChatRunDatabaseRow);
  }
  return null;
}

export async function updateChatRun(params: {
  supabase: SupabaseLike;
  runId: string;
  values: Record<string, unknown>;
}) {
  const { error } = await params.supabase
    .from('chat_runs')
    .update({ ...params.values, updated_at: new Date().toISOString() })
    .eq('id', params.runId);
  if (error) throw new Error(error.message || 'Failed to update chat run');
}

export async function updateActiveChatRun(params: {
  supabase: SupabaseLike;
  runId: string;
  values: Record<string, unknown>;
}) {
  const { data, error } = await params.supabase
    .from('chat_runs')
    .update({ ...params.values, updated_at: new Date().toISOString() })
    .eq('id', params.runId)
    .in('status', ['queued', 'submitting', 'streaming', 'finalizing', 'interrupted'])
    .select('id')
    .maybeSingle();
  if (error) throw new Error(error.message || 'Failed to update active chat run');
  return Boolean(data);
}

/**
 * Title work can outlive response completion. Keep cancellation authoritative,
 * while allowing that independent subsystem to settle after a completed or
 * failed response.
 */
export async function updateUncancelledChatRun(params: {
  supabase: SupabaseLike;
  runId: string;
  values: Record<string, unknown>;
}) {
  const { data, error } = await params.supabase
    .from('chat_runs')
    .update({ ...params.values, updated_at: new Date().toISOString() })
    .eq('id', params.runId)
    .in('status', [
      'queued',
      'submitting',
      'streaming',
      'finalizing',
      'interrupted',
      'completed',
      'failed',
    ])
    .select('id')
    .maybeSingle();
  if (error) throw new Error(error.message || 'Failed to update uncancelled chat run');
  return Boolean(data);
}

export async function logChatRunEvent(params: {
  supabase: SupabaseLike;
  userId: string;
  runId: string;
  event: string;
  detailCode?: string | null;
}) {
  console.info('[chat-run]', {
    runId: params.runId,
    mode: 'persistent',
    event: params.event,
    detailCode: params.detailCode ?? undefined,
  });
  await params.supabase.from('chat_run_events').insert({
    user_id: params.userId,
    run_id: params.runId,
    event: params.event,
    detail_code: params.detailCode ?? null,
  });
}

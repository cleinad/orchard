import type { ChatRunSnapshot } from '@/lib/chat-runs/protocol';

export const CHAT_RUN_NOT_FOUND_GRACE_MS = 10_000;
export const CHAT_RUN_RECONCILIATION_TIMEOUT_MS = 5 * 60_000;

export class ChatRunApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'ChatRunApiError';
  }
}

interface ChatRunApiPayload {
  run?: ChatRunSnapshot;
  code?: string;
  error?: string;
}

interface FetchChatRunOptions {
  fetchImpl?: typeof fetch;
  recordReconciliation?: boolean;
}

export async function fetchChatRunSnapshot(
  runId: string,
  options: FetchChatRunOptions = {}
): Promise<ChatRunSnapshot | null> {
  const response = await (options.fetchImpl ?? fetch)(`/api/chat-runs/${runId}`, {
    method: 'GET',
    cache: 'no-store',
    headers: options.recordReconciliation
      ? { 'x-chat-run-reconciliation': 'initial' }
      : undefined,
  });
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new ChatRunApiError(
      'The chat run endpoint returned an unexpected response.',
      'unexpected_response',
      response.status
    );
  }

  const payload = (await response.json()) as ChatRunApiPayload;
  if (response.status === 404 && payload.code === 'run_not_found') {
    return null;
  }
  if (!response.ok) {
    throw new ChatRunApiError(
      payload.error || 'Failed to reconcile chat run.',
      payload.code || 'run_reconciliation_failed',
      response.status
    );
  }
  if (!payload.run) {
    throw new ChatRunApiError(
      'The chat run endpoint returned no snapshot.',
      'missing_run_snapshot',
      response.status
    );
  }
  return payload.run;
}

export type PollChatRunResult =
  | { kind: 'settled'; snapshot: ChatRunSnapshot }
  | { kind: 'missing'; latestSnapshot: ChatRunSnapshot | null }
  | { kind: 'timed_out'; latestSnapshot: ChatRunSnapshot | null };

interface PollChatRunOptions {
  load: () => Promise<ChatRunSnapshot | null>;
  isSettled: (snapshot: ChatRunSnapshot) => boolean;
  onSnapshot?: (snapshot: ChatRunSnapshot) => void;
  missingGraceMs?: number;
  timeoutMs?: number;
  now?: () => number;
  wait?: (delayMs: number) => Promise<void>;
}

export async function pollChatRun({
  load,
  isSettled,
  onSnapshot,
  missingGraceMs = CHAT_RUN_NOT_FOUND_GRACE_MS,
  timeoutMs = CHAT_RUN_RECONCILIATION_TIMEOUT_MS,
  now = Date.now,
  wait = (delayMs) => new Promise((resolve) => window.setTimeout(resolve, delayMs)),
}: PollChatRunOptions): Promise<PollChatRunResult> {
  const startedAt = now();
  let missingSince: number | null = startedAt;
  let latestSnapshot: ChatRunSnapshot | null = null;
  let delayMs = 250;

  while (true) {
    const snapshot = await load();
    const checkedAt = now();
    if (snapshot) {
      latestSnapshot = snapshot;
      missingSince = null;
      onSnapshot?.(snapshot);
      if (isSettled(snapshot)) return { kind: 'settled', snapshot };
    } else {
      missingSince ??= checkedAt;
      if (checkedAt - missingSince >= missingGraceMs) {
        return { kind: 'missing', latestSnapshot };
      }
    }

    if (checkedAt - startedAt >= timeoutMs) {
      return { kind: 'timed_out', latestSnapshot };
    }
    await wait(delayMs);
    delayMs = Math.min(3_000, Math.round(delayMs * 1.5));
  }
}

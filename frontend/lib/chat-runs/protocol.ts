import type { SearchMetadata } from '@/lib/chat-search';
import type { SearchActivitySummary } from '@/lib/search/types';

export const CHAT_RUN_STATUSES = [
  'queued',
  'submitting',
  'streaming',
  'finalizing',
  'completed',
  'failed',
  'cancelled',
  'interrupted',
] as const;

export type ChatRunStatus = (typeof CHAT_RUN_STATUSES)[number];

export const CHAT_RUN_SUBSYSTEM_STATUSES = [
  'pending',
  'running',
  'completed',
  'failed',
  'skipped',
  'cancelled',
] as const;

export type ChatRunSubsystemStatus =
  (typeof CHAT_RUN_SUBSYSTEM_STATUSES)[number];

export type ChatRunMode = 'persistent' | 'temporary';
export type ChatRunTitleSource = 'fallback' | 'generated' | 'user';
export type ChatRunTargetKind = 'main' | 'branch' | 'thread';

export interface ChatRunTarget {
  kind: ChatRunTargetKind;
  /** Persistent conversation id or temporary session id. */
  chatId: string;
  conversationId: string | null;
  threadId: string | null;
  branchId: string | null;
  branchSourceMessageId: string | null;
  sourceMessageId: string | null;
  expectedPredecessorId: string | null;
}

export interface ChatRunSubsystems {
  response: ChatRunSubsystemStatus;
  title: ChatRunSubsystemStatus;
  search: ChatRunSubsystemStatus;
}

export interface ChatRunTitleSnapshot {
  value: string | null;
  source: ChatRunTitleSource;
  version: number;
  runId: string | null;
}

export interface ChatRunSnapshot {
  runId: string;
  mode: ChatRunMode;
  status: ChatRunStatus;
  target: ChatRunTarget;
  userMessageId: string;
  assistantMessageId: string;
  createdThreadId: string | null;
  createdBranchId: string | null;
  response: string | null;
  search: SearchMetadata | null;
  searchActivity: SearchActivitySummary | null;
  title: ChatRunTitleSnapshot;
  subsystems: ChatRunSubsystems;
  errorCode: string | null;
  errorMessage: string | null;
  /** Null until the server has acknowledged a persistent run. */
  acceptedAt: string | null;
  updatedAt: string;
  completedAt: string | null;
  expiresAt: string | null;
}

export interface ChatRunIdentifiers {
  runId: string;
  userMessageId: string;
  assistantMessageId: string;
  threadId?: string;
  branchId?: string;
}

export function buildChatRunTarget(params: {
  mode: ChatRunMode;
  conversationId: string | null;
  temporarySessionId: string | null;
  threadId: string | null;
  branchId: string | null;
  branchSourceMessageId: string | null;
  sourceMessageId: string | null;
  expectedPredecessorId: string | null;
}): ChatRunTarget {
  const kind = params.threadId
    ? 'thread'
    : params.branchSourceMessageId
      ? 'branch'
      : 'main';
  const chatId = params.mode === 'persistent'
    ? params.conversationId
    : params.temporarySessionId;
  if (!chatId) throw new Error('Chat run target requires a chat id');
  return {
    kind,
    chatId,
    conversationId: params.conversationId,
    threadId: params.threadId,
    branchId: params.branchId,
    branchSourceMessageId: params.branchSourceMessageId,
    sourceMessageId: params.sourceMessageId,
    expectedPredecessorId: params.expectedPredecessorId,
  };
}

export function getChatRunScopeKey(target: ChatRunTarget) {
  if (target.kind === 'thread') {
    return `${target.chatId}:thread:${target.threadId}`;
  }
  if (target.kind === 'branch') {
    return `${target.chatId}:branch:${target.branchSourceMessageId}:${target.expectedPredecessorId ?? 'root'}`;
  }
  return `${target.chatId}:main:${target.expectedPredecessorId ?? 'root'}`;
}

export type ChatRunAction =
  | { type: 'submitted' }
  | { type: 'accepted'; snapshot: ChatRunSnapshot }
  | { type: 'streaming' }
  | { type: 'finalizing' }
  | { type: 'reconciled'; snapshot: ChatRunSnapshot }
  | { type: 'failed'; code?: string; message: string }
  | { type: 'cancelled' }
  | { type: 'interrupted'; message?: string };

const TERMINAL_STATUSES = new Set<ChatRunStatus>([
  'completed',
  'failed',
  'cancelled',
]);

export function isTerminalChatRunStatus(status: ChatRunStatus) {
  return TERMINAL_STATUSES.has(status);
}

/**
 * Persistent interruptions remain reconcilable. A temporary interruption is
 * locally final because incognito runs have no remote recovery record.
 */
export function isSettledChatRunSnapshot(run: ChatRunSnapshot) {
  return isTerminalChatRunStatus(run.status)
    || (run.mode === 'temporary' && run.status === 'interrupted');
}

export function findActiveMainChatRun(
  runs: Iterable<ChatRunSnapshot>,
  chatId: string
) {
  return [...runs]
    .filter(
      (run) =>
        run.target.chatId === chatId
        && run.target.kind !== 'thread'
        && !isSettledChatRunSnapshot(run)
    )
    .sort((a, b) =>
      (b.acceptedAt ?? b.updatedAt).localeCompare(a.acceptedAt ?? a.updatedAt)
    )[0] ?? null;
}

export function createChatRunIdentifiers(
  targetKind: ChatRunTargetKind
): ChatRunIdentifiers {
  const identifiers: ChatRunIdentifiers = {
    runId: crypto.randomUUID(),
    userMessageId: crypto.randomUUID(),
    assistantMessageId: crypto.randomUUID(),
  };

  if (targetKind === 'thread') {
    identifiers.threadId = crypto.randomUUID();
  }
  if (targetKind === 'branch') {
    identifiers.branchId = crypto.randomUUID();
  }

  return identifiers;
}

export function chatRunReducer(
  state: ChatRunSnapshot,
  action: ChatRunAction
): ChatRunSnapshot {
  if (action.type === 'accepted' || action.type === 'reconciled') {
    return action.snapshot;
  }

  if (TERMINAL_STATUSES.has(state.status)) {
    return state;
  }

  const updatedAt = new Date().toISOString();
  switch (action.type) {
    case 'submitted':
      return { ...state, status: 'submitting', updatedAt };
    case 'streaming':
      return {
        ...state,
        status: 'streaming',
        subsystems: { ...state.subsystems, response: 'running' },
        updatedAt,
      };
    case 'finalizing':
      return { ...state, status: 'finalizing', updatedAt };
    case 'failed':
      return {
        ...state,
        status: 'failed',
        errorCode: action.code ?? 'run_failed',
        errorMessage: action.message,
        subsystems: { ...state.subsystems, response: 'failed' },
        updatedAt,
      };
    case 'cancelled':
      return {
        ...state,
        status: 'cancelled',
        subsystems: { ...state.subsystems, response: 'cancelled' },
        updatedAt,
      };
    case 'interrupted':
      return {
        ...state,
        status: 'interrupted',
        errorCode: 'connection_interrupted',
        errorMessage: action.message ?? null,
        updatedAt,
      };
  }
}

export function createQueuedChatRunSnapshot(params: {
  identifiers: ChatRunIdentifiers;
  mode: ChatRunMode;
  target: ChatRunTarget;
  fallbackTitle: string;
}): ChatRunSnapshot {
  const now = new Date().toISOString();
  return {
    runId: params.identifiers.runId,
    mode: params.mode,
    status: 'queued',
    target: params.target,
    userMessageId: params.identifiers.userMessageId,
    assistantMessageId: params.identifiers.assistantMessageId,
    createdThreadId: params.identifiers.threadId ?? null,
    createdBranchId: params.identifiers.branchId ?? null,
    response: null,
    search: null,
    searchActivity: null,
    title: {
      value: params.fallbackTitle,
      source: 'fallback',
      version: 0,
      runId: params.identifiers.runId,
    },
    subsystems: {
      response: 'pending',
      title: 'pending',
      search: 'pending',
    },
    errorCode: null,
    errorMessage: null,
    acceptedAt: null,
    updatedAt: now,
    completedAt: null,
    expiresAt: null,
  };
}

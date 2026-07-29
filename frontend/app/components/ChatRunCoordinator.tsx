'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import {
  chatRunReducer,
  isSettledChatRunSnapshot,
  isTerminalChatRunStatus,
  type ChatRunSnapshot,
} from '@/lib/chat-runs/protocol';
import { loadStoredChatRuns, storeChatRuns } from '@/lib/chat-runs/storage';
import {
  CHAT_RUN_NOT_FOUND_GRACE_MS,
  fetchChatRunSnapshot,
  pollChatRun,
  type PollChatRunResult,
} from '@/lib/chat-runs/reconciliation';
import type { SearchActivitySummary } from '@/lib/search/types';

interface StartRunHandlers {
  onDelta?: (delta: string) => void;
  onSearchActivity?: (activity: SearchActivitySummary) => void;
  onSnapshot?: (snapshot: ChatRunSnapshot) => void;
}

interface StartRunParams extends StartRunHandlers {
  request: Record<string, unknown>;
  initialSnapshot: ChatRunSnapshot;
  attempt?: number;
}

interface ChatRunCoordinatorValue {
  start: (params: StartRunParams) => Promise<ChatRunSnapshot>;
  stop: (runId: string) => Promise<ChatRunSnapshot | null>;
  closeTemporaryChat: (chatId: string) => Promise<void>;
  dismiss: (runId: string) => void;
  reconcile: (runId: string) => Promise<ChatRunSnapshot | null>;
  getSnapshot: (runId: string) => ChatRunSnapshot | null;
  getSnapshotsForChat: (chatId: string) => ChatRunSnapshot[];
  getActiveRunForChat: (chatId: string) => ChatRunSnapshot | null;
  subscribe: (
    runId: string,
    listener: (snapshot: ChatRunSnapshot) => void
  ) => () => void;
  subscribeAll: (listener: (snapshot: ChatRunSnapshot) => void) => () => void;
}

interface StreamMetadata {
  run?: ChatRunSnapshot;
  runId?: string;
  message?: string;
  error?: string;
  conversationTitle?: string | null;
  conversationTitleSource?: 'fallback' | 'generated';
  titleStatus?: 'completed' | 'failed' | 'skipped';
  conversationId?: string;
  userMessageId?: string;
  assistantMessageId?: string;
  threadId?: string | null;
  search?: ChatRunSnapshot['search'];
  searchActivity?: ChatRunSnapshot['searchActivity'];
}

const ChatRunCoordinatorContext = createContext<ChatRunCoordinatorValue | null>(null);

async function readRunStream(
  response: Response,
  handlers: StartRunHandlers
): Promise<StreamMetadata> {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return (await response.json()) as StreamMetadata;
  }
  if (!response.body) throw new Error('No response body');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let metadata: StreamMetadata = {};
  const processLine = (line: string) => {
    if (!line.startsWith('data: ')) return;
    const payload = line.slice(6).trim();
    if (!payload || payload === '[DONE]') return;
    try {
      const event = JSON.parse(payload) as {
        type?: unknown;
        delta?: unknown;
        data?: unknown;
        errorText?: unknown;
      };
      if (event.type === 'text-delta' && typeof event.delta === 'string') {
        handlers.onDelta?.(event.delta);
      } else if (event.type === 'data-searchActivity' && event.data) {
        handlers.onSearchActivity?.(event.data as SearchActivitySummary);
      } else if (event.type === 'data-chatRun' && event.data) {
        handlers.onSnapshot?.(event.data as ChatRunSnapshot);
      } else if (event.type === 'data-chatMeta' && event.data) {
        metadata = event.data as StreamMetadata;
      } else if (event.type === 'error' && typeof event.errorText === 'string') {
        metadata = { error: event.errorText };
      }
    } catch {
      // A malformed event must not prevent final-state reconciliation.
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      buffer += decoder.decode();
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    lines.forEach(processLine);
  }
  if (buffer) processLine(buffer);
  return metadata;
}

export function ChatRunCoordinator({ children }: { children: ReactNode }) {
  const runsRef = useRef(new Map<string, ChatRunSnapshot>());
  const subscribersRef = useRef(
    new Map<string, Set<(snapshot: ChatRunSnapshot) => void>>()
  );
  const globalSubscribersRef = useRef(
    new Set<(snapshot: ChatRunSnapshot) => void>()
  );
  const localAbortControllersRef = useRef(new Map<string, AbortController>());
  const ignoredTemporaryChatIdsRef = useRef(new Set<string>());
  const reconcilePromisesRef = useRef(
    new Map<string, Promise<ChatRunSnapshot | null>>()
  );
  const reconciliationEventsRef = useRef(new Set<string>());

  const publish = useCallback((snapshot: ChatRunSnapshot) => {
    if (
      snapshot.mode === 'temporary'
      && ignoredTemporaryChatIdsRef.current.has(snapshot.target.chatId)
    ) {
      runsRef.current.delete(snapshot.runId);
      storeChatRuns(runsRef.current.values());
      return;
    }
    const previous = runsRef.current.get(snapshot.runId);
    if (
      previous?.status === 'cancelled'
      && snapshot.status !== 'cancelled'
    ) {
      return;
    }
    if (
      previous
      && isTerminalChatRunStatus(previous.status)
      && !isTerminalChatRunStatus(snapshot.status)
    ) {
      return;
    }
    runsRef.current.set(snapshot.runId, snapshot);
    storeChatRuns(runsRef.current.values());
    for (const subscriber of subscribersRef.current.get(snapshot.runId) ?? []) {
      subscriber(snapshot);
    }
    for (const subscriber of globalSubscribersRef.current) subscriber(snapshot);
  }, []);

  const reconcile = useCallback(async (runId: string) => {
    const local = runsRef.current.get(runId);
    if (local?.mode === 'temporary') return local;
    const existing = reconcilePromisesRef.current.get(runId);
    if (existing) return existing;

    const shouldRecordReconciliation = !reconciliationEventsRef.current.has(runId);
    const promise = fetchChatRunSnapshot(runId, {
      recordReconciliation: shouldRecordReconciliation,
    }).then((snapshot) => {
      if (snapshot) {
        if (shouldRecordReconciliation) reconciliationEventsRef.current.add(runId);
        publish(snapshot);
      }
      return snapshot;
    }).finally(() => {
      reconcilePromisesRef.current.delete(runId);
    });
    reconcilePromisesRef.current.set(runId, promise);
    return promise;
  }, [publish]);

  const reconcileUntilTerminal = useCallback(async (
    runId: string,
    missingGraceMs = CHAT_RUN_NOT_FOUND_GRACE_MS
  ): Promise<PollChatRunResult> => pollChatRun({
    load: () => reconcile(runId),
    isSettled: (snapshot) => isTerminalChatRunStatus(snapshot.status),
    missingGraceMs,
  }), [reconcile]);

  const reconcileTitleUntilSettled = useCallback(async (
    runId: string
  ): Promise<PollChatRunResult> => pollChatRun({
    load: () => reconcile(runId),
    isSettled: (snapshot) =>
      !['pending', 'running'].includes(snapshot.subsystems.title),
  }), [reconcile]);

  const publishMissingRun = useCallback((runId: string) => {
    const previous = runsRef.current.get(runId);
    if (!previous || isTerminalChatRunStatus(previous.status)) return previous ?? null;
    const serverAcknowledged = Boolean(previous.acceptedAt);
    const failed = chatRunReducer(previous, {
      type: 'failed',
      code: serverAcknowledged ? 'run_record_missing' : 'request_not_accepted',
      message: serverAcknowledged
        ? 'The response could not be recovered. Please retry.'
        : 'The request was interrupted before the server accepted it. Please retry.',
    });
    publish(failed);
    return failed;
  }, [publish]);

  const publishTimedOutRun = useCallback((runId: string) => {
    const previous = runsRef.current.get(runId);
    if (!previous || isTerminalChatRunStatus(previous.status)) return previous ?? null;
    const interrupted = chatRunReducer(previous, {
      type: 'interrupted',
      message: 'The response status could not be confirmed before reconnection timed out. Reconnect to check again.',
    });
    publish(interrupted);
    return interrupted;
  }, [publish]);

  const publishReconciliationFailedRun = useCallback((
    runId: string,
    serverMessage?: string
  ) => {
    const previous = runsRef.current.get(runId);
    if (!previous || isTerminalChatRunStatus(previous.status)) return previous ?? null;
    const interrupted = chatRunReducer(previous, {
      type: 'interrupted',
      message: serverMessage
        ?? 'The response status could not be confirmed. Reconnect to check again.',
    });
    publish(interrupted);
    return interrupted;
  }, [publish]);

  const start = useCallback(async ({
    request,
    initialSnapshot,
    attempt = 0,
    ...handlers
  }: StartRunParams) => {
    const existing = runsRef.current.get(initialSnapshot.runId);
    if (existing && existing.status !== 'queued') {
      handlers.onSnapshot?.(existing);
      if (isSettledChatRunSnapshot(existing)) return existing;
      if (existing.mode === 'temporary' || !existing.acceptedAt) return existing;
      const result = await reconcileUntilTerminal(existing.runId);
      if (result.kind === 'settled') return result.snapshot;
      if (result.kind === 'timed_out') {
        return publishTimedOutRun(existing.runId) ?? existing;
      }
      return publishMissingRun(existing.runId) ?? existing;
    }

    const submitting = chatRunReducer(initialSnapshot, { type: 'submitted' });
    publish(submitting);
    handlers.onSnapshot?.(submitting);
    const controller = new AbortController();
    localAbortControllersRef.current.set(initialSnapshot.runId, controller);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
      if (!response.ok) {
        const data = (await response.json()) as StreamMetadata;
        const submissionError = new Error(data.error || 'Failed to start chat run');
        submissionError.name = response.status === 409
          ? 'ChatRunConflictError'
          : response.status >= 400 && response.status < 500
            ? 'ChatRunSubmissionError'
            : 'ChatRunRequestError';
        throw submissionError;
      }

      const acknowledged = chatRunReducer(submitting, {
        type: 'accepted',
        snapshot: {
          ...submitting,
          acceptedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });
      const streaming = chatRunReducer(acknowledged, { type: 'streaming' });
      publish(streaming);
      handlers.onSnapshot?.(streaming);
      const metadata = await readRunStream(response, {
        ...handlers,
        onSnapshot: (snapshot) => {
          publish(snapshot);
          handlers.onSnapshot?.(snapshot);
        },
      });
      if (metadata.error) throw new Error(metadata.error);
      const directSnapshot = metadata.run
        ?? (metadata.message
          ? {
              ...initialSnapshot,
              status: 'completed' as const,
              userMessageId: metadata.userMessageId ?? initialSnapshot.userMessageId,
              assistantMessageId:
                metadata.assistantMessageId ?? initialSnapshot.assistantMessageId,
              createdThreadId: metadata.threadId ?? initialSnapshot.createdThreadId,
              response: metadata.message,
              search: metadata.search ?? null,
              searchActivity: metadata.searchActivity ?? null,
              title: {
                ...initialSnapshot.title,
                value: metadata.conversationTitle ?? initialSnapshot.title.value,
                source:
                  metadata.conversationTitleSource ?? initialSnapshot.title.source,
                version: metadata.conversationTitleSource === 'generated' ? 1 : 0,
              },
              subsystems: {
                response: 'completed' as const,
                title: metadata.titleStatus ?? 'completed' as const,
                search: metadata.search ? 'completed' as const : 'skipped' as const,
              },
              updatedAt: new Date().toISOString(),
              completedAt: new Date().toISOString(),
              acceptedAt: acknowledged.acceptedAt,
            }
          : null);
      let snapshot = directSnapshot;
      if (
        initialSnapshot.mode === 'persistent'
        && (!directSnapshot || !isTerminalChatRunStatus(directSnapshot.status))
      ) {
        const result = await reconcileUntilTerminal(initialSnapshot.runId);
        snapshot = result.kind === 'settled'
          ? result.snapshot
          : result.kind === 'timed_out'
            ? publishTimedOutRun(initialSnapshot.runId)
            : publishMissingRun(initialSnapshot.runId);
      }
      if (!snapshot) {
        snapshot = publishMissingRun(initialSnapshot.runId);
      }
      if (!snapshot) throw new Error('Chat run did not produce a final snapshot');
      publish(snapshot);
      handlers.onSnapshot?.(snapshot);
      if (
        snapshot.mode === 'persistent'
        && ['pending', 'running'].includes(snapshot.subsystems.title)
      ) {
        void reconcileTitleUntilSettled(snapshot.runId).catch(() => null);
      }
      return snapshot;
    } catch (error) {
      if (
        error instanceof Error
        && (error.name === 'ChatRunConflictError' || error.name === 'ChatRunSubmissionError')
      ) {
        const failed = chatRunReducer(
          runsRef.current.get(initialSnapshot.runId) ?? submitting,
          {
            type: 'failed',
            code: error.name === 'ChatRunConflictError'
              ? 'run_conflict'
              : 'submission_rejected',
            message: error.message,
          }
        );
        publish(failed);
        handlers.onSnapshot?.(failed);
        throw error;
      }
      if (
        initialSnapshot.mode === 'temporary'
        && error instanceof Error
        && error.name === 'ChatRunRequestError'
      ) {
        const failed = chatRunReducer(
          runsRef.current.get(initialSnapshot.runId) ?? submitting,
          {
            type: 'failed',
            code: 'request_failed',
            message: error.message,
          }
        );
        publish(failed);
        handlers.onSnapshot?.(failed);
        return failed;
      }
      if (controller.signal.aborted) {
        const local = runsRef.current.get(initialSnapshot.runId);
        if (local?.status === 'cancelled') {
          return local;
        }
        const cancellationResult = await reconcileUntilTerminal(initialSnapshot.runId)
          .catch(() => null);
        if (cancellationResult?.kind === 'settled') return cancellationResult.snapshot;
      }
      if (initialSnapshot.mode === 'temporary') {
        const interrupted = chatRunReducer(
          runsRef.current.get(initialSnapshot.runId) ?? submitting,
          {
            type: 'interrupted',
            message: 'The temporary response was interrupted. Retry when you are ready.',
          }
        );
        publish(interrupted);
        handlers.onSnapshot?.(interrupted);
        return interrupted;
      }

      let reconciliationFailed = false;
      const reconciliationResult = await reconcileUntilTerminal(initialSnapshot.runId)
        .catch(() => {
          reconciliationFailed = true;
          return null;
        });
      if (reconciliationResult?.kind === 'settled') {
        handlers.onSnapshot?.(reconciliationResult.snapshot);
        if (['pending', 'running'].includes(reconciliationResult.snapshot.subsystems.title)) {
          void reconcileTitleUntilSettled(reconciliationResult.snapshot.runId).catch(() => null);
        }
        return reconciliationResult.snapshot;
      }
      if (reconciliationResult?.kind === 'timed_out') {
        const timedOut = publishTimedOutRun(initialSnapshot.runId);
        if (timedOut) handlers.onSnapshot?.(timedOut);
        return timedOut ?? submitting;
      }
      if (attempt < 2 && !controller.signal.aborted) {
        await new Promise((resolve) => window.setTimeout(resolve, 300 * (attempt + 1)));
        runsRef.current.delete(initialSnapshot.runId);
        return start({
          request,
          initialSnapshot,
          attempt: attempt + 1,
          ...handlers,
        });
      }
      if (reconciliationFailed) {
        const interrupted = publishReconciliationFailedRun(
          initialSnapshot.runId,
          error instanceof Error && error.name === 'ChatRunRequestError'
            ? error.message
            : undefined
        );
        if (interrupted) handlers.onSnapshot?.(interrupted);
        return interrupted ?? submitting;
      }
      const failed = publishMissingRun(initialSnapshot.runId)
        ?? chatRunReducer(submitting, {
          type: 'failed',
          code: 'request_not_accepted',
          message: error instanceof Error
            ? error.message
            : 'The request was not accepted. Please retry.',
        });
      publish(failed);
      handlers.onSnapshot?.(failed);
      return failed;
    } finally {
      localAbortControllersRef.current.delete(initialSnapshot.runId);
    }
  }, [
    publish,
    publishMissingRun,
    publishReconciliationFailedRun,
    publishTimedOutRun,
    reconcileTitleUntilSettled,
    reconcileUntilTerminal,
  ]);

  const stop = useCallback(async (runId: string) => {
    const local = runsRef.current.get(runId);
    if (local?.mode === 'temporary') {
      localAbortControllersRef.current.get(runId)?.abort();
      const cancelled = chatRunReducer(local, { type: 'cancelled' });
      publish(cancelled);
      return cancelled;
    }

    // A run can be visible locally before accept_chat_run commits it. Keep the
    // submission connected and retry cancellation through that short window;
    // aborting first can otherwise strand an independently consumed response.
    const deadline = Date.now() + CHAT_RUN_NOT_FOUND_GRACE_MS;
    while (true) {
      let response: Response;
      try {
        response = await fetch(`/api/chat-runs/${runId}/cancel`, { method: 'POST' });
      } catch {
        return null;
      }
      const contentType = response.headers.get('content-type') ?? '';
      const data = contentType.includes('application/json')
        ? await response.json() as {
            run?: ChatRunSnapshot;
            code?: string;
          }
        : {};
      if (response.ok) {
        localAbortControllersRef.current.get(runId)?.abort();
        if (data.run) publish(data.run);
        return data.run ?? null;
      }
      if (
        response.status !== 404
        || data.code !== 'run_not_found'
        || Date.now() >= deadline
      ) {
        return null;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 150));
    }
  }, [publish]);

  const closeTemporaryChat = useCallback(async (chatId: string) => {
    ignoredTemporaryChatIdsRef.current.add(chatId);
    const runs = [...runsRef.current.values()].filter(
      (run) => run.mode === 'temporary' && run.target.chatId === chatId
    );
    for (const run of runs) {
      localAbortControllersRef.current.get(run.runId)?.abort();
      runsRef.current.delete(run.runId);
    }
    storeChatRuns(runsRef.current.values());
  }, []);

  const dismiss = useCallback((runId: string) => {
    runsRef.current.delete(runId);
    storeChatRuns(runsRef.current.values());
  }, []);

  const getSnapshot = useCallback(
    (runId: string) => runsRef.current.get(runId) ?? null,
    []
  );
  const getSnapshotsForChat = useCallback((chatId: string) =>
    [...runsRef.current.values()]
      .filter((run) => run.target.chatId === chatId)
      .sort((a, b) =>
        (a.acceptedAt ?? a.updatedAt).localeCompare(b.acceptedAt ?? b.updatedAt)
      ), []);
  const getActiveRunForChat = useCallback((chatId: string) =>
    [...runsRef.current.values()]
      .filter(
        (run) => run.target.chatId === chatId && !isSettledChatRunSnapshot(run)
      )
      .sort((a, b) =>
        (b.acceptedAt ?? b.updatedAt).localeCompare(a.acceptedAt ?? a.updatedAt)
      )[0] ?? null, []);

  const subscribe = useCallback<ChatRunCoordinatorValue['subscribe']>(
    (runId, listener) => {
      const listeners = subscribersRef.current.get(runId) ?? new Set();
      listeners.add(listener);
      subscribersRef.current.set(runId, listeners);
      const snapshot = runsRef.current.get(runId);
      if (snapshot) listener(snapshot);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) subscribersRef.current.delete(runId);
      };
    },
    []
  );
  const subscribeAll = useCallback<ChatRunCoordinatorValue['subscribeAll']>(
    (listener) => {
      globalSubscribersRef.current.add(listener);
      runsRef.current.forEach(listener);
      return () => globalSubscribersRef.current.delete(listener);
    },
    []
  );

  useEffect(() => {
    const restored = loadStoredChatRuns();
    restored.forEach((run) => {
      if (run.mode === 'temporary' && !isSettledChatRunSnapshot(run)) {
        publish(chatRunReducer(run, {
          type: 'interrupted',
          message: 'The temporary response was interrupted. Retry when you are ready.',
        }));
      } else {
        publish(run);
      }
    });
    restored
      .filter((run) => run.mode === 'persistent')
      .forEach((run) => {
        void reconcileUntilTerminal(run.runId)
          .then((result) => {
            if (result.kind === 'missing') publishMissingRun(run.runId);
            if (result.kind === 'timed_out') publishTimedOutRun(run.runId);
          })
          .catch(() => {
            publishReconciliationFailedRun(run.runId);
          });
        if (run.acceptedAt) {
          void reconcileTitleUntilSettled(run.runId).catch(() => null);
        }
      });

    const reconcileActive = () => {
      for (const run of runsRef.current.values()) {
        if (
          run.mode === 'persistent'
          && run.acceptedAt
          && !isTerminalChatRunStatus(run.status)
        ) {
          void reconcileUntilTerminal(run.runId).catch(() => null);
        }
        if (
          run.mode === 'persistent'
          && run.acceptedAt
          && ['pending', 'running'].includes(run.subsystems.title)
        ) {
          void reconcileTitleUntilSettled(run.runId).catch(() => null);
        }
      }
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') reconcileActive();
    };
    window.addEventListener('online', reconcileActive);
    window.addEventListener('pageshow', reconcileActive);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('online', reconcileActive);
      window.removeEventListener('pageshow', reconcileActive);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [
    publish,
    publishMissingRun,
    publishReconciliationFailedRun,
    publishTimedOutRun,
    reconcileTitleUntilSettled,
    reconcileUntilTerminal,
  ]);

  const value = useMemo<ChatRunCoordinatorValue>(() => ({
    start,
    stop,
    closeTemporaryChat,
    dismiss,
    reconcile,
    getSnapshot,
    getSnapshotsForChat,
    getActiveRunForChat,
    subscribe,
    subscribeAll,
  }), [
    closeTemporaryChat,
    dismiss,
    getActiveRunForChat,
    getSnapshot,
    getSnapshotsForChat,
    reconcile,
    start,
    stop,
    subscribe,
    subscribeAll,
  ]);

  return (
    <ChatRunCoordinatorContext.Provider value={value}>
      {children}
    </ChatRunCoordinatorContext.Provider>
  );
}

export function useChatRunCoordinator() {
  const value = useContext(ChatRunCoordinatorContext);
  if (!value) {
    throw new Error('useChatRunCoordinator must be used within ChatRunCoordinator');
  }
  return value;
}

export function useOptionalChatRunCoordinator() {
  return useContext(ChatRunCoordinatorContext);
}

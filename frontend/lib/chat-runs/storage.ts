import type { ChatRunSnapshot } from '@/lib/chat-runs/protocol';
import { isTerminalChatRunStatus } from '@/lib/chat-runs/protocol';

// v2 distinguishes client-local submission from server acknowledgement.
const ACTIVE_RUNS_STORAGE_KEY = 'orchard-chat-runs-v2';
function canUseSessionStorage() {
  return typeof window !== 'undefined' && Boolean(window.sessionStorage);
}

export function loadStoredChatRuns(): ChatRunSnapshot[] {
  if (!canUseSessionStorage()) return [];
  try {
    const value = window.sessionStorage.getItem(ACTIVE_RUNS_STORAGE_KEY);
    const parsed = value ? JSON.parse(value) : [];
    return Array.isArray(parsed) ? (parsed as ChatRunSnapshot[]) : [];
  } catch {
    window.sessionStorage.removeItem(ACTIVE_RUNS_STORAGE_KEY);
    return [];
  }
}

export function storeChatRuns(runs: Iterable<ChatRunSnapshot>) {
  if (!canUseSessionStorage()) return;
  const values = [...runs].filter(
    (run) => run.mode === 'temporary'
      ? !run.expiresAt || Date.parse(run.expiresAt) > Date.now()
      : !isTerminalChatRunStatus(run.status)
        || ['pending', 'running'].includes(run.subsystems.title)
  );
  if (values.length === 0) {
    window.sessionStorage.removeItem(ACTIVE_RUNS_STORAGE_KEY);
    return;
  }
  window.sessionStorage.setItem(ACTIVE_RUNS_STORAGE_KEY, JSON.stringify(values));
}

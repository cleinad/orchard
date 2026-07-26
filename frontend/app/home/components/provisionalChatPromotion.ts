import type {
  PersistentDraftChat,
  SelectedChat,
} from '@/app/home/components/HomeDataContext';
import {
  fromStoredMessage,
  toStoredMessage,
  type StoredMessage,
} from '@/app/home/components/homeStorage';
import type { ChatRunSnapshot } from '@/lib/chat-runs/protocol';

const STORAGE_KEY = 'orchard-provisional-chat-promotions-v1';
const memoryPromotions = new Map<string, ProvisionalChatPromotion>();

interface StoredProvisionalChatPromotion {
  runId: string;
  conversationId: string;
  prompt: string;
  draft: Omit<PersistentDraftChat, 'messages'> & {
    messages: StoredMessage[];
  };
}

export interface ProvisionalChatPromotion {
  runId: string;
  conversationId: string;
  prompt: string;
  draft: PersistentDraftChat;
}

function getSessionStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function readStoredPromotions(): Record<string, StoredProvisionalChatPromotion> {
  const storage = getSessionStorage();
  if (!storage) return {};

  try {
    const stored = storage.getItem(STORAGE_KEY);
    if (!stored) return {};
    const parsed = JSON.parse(stored) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Invalid provisional promotion storage');
    }
    return parsed as Record<string, StoredProvisionalChatPromotion>;
  } catch {
    try {
      storage.removeItem(STORAGE_KEY);
    } catch {
      // Recovery storage is best-effort and must never block chat submission.
    }
    return {};
  }
}

function writeStoredPromotions(
  promotions: Record<string, StoredProvisionalChatPromotion>
) {
  const storage = getSessionStorage();
  if (!storage) return;
  try {
    if (Object.keys(promotions).length === 0) {
      storage.removeItem(STORAGE_KEY);
      return;
    }
    storage.setItem(STORAGE_KEY, JSON.stringify(promotions));
  } catch {
    // The optimistic UX still works when recovery storage is unavailable.
  }
}

export function storeProvisionalChatPromotion(
  promotion: ProvisionalChatPromotion
) {
  const storedPromotion: StoredProvisionalChatPromotion = {
    runId: promotion.runId,
    conversationId: promotion.conversationId,
    prompt: promotion.prompt,
    draft: {
      ...promotion.draft,
      messages: promotion.draft.messages.map(toStoredMessage),
    },
  };
  memoryPromotions.set(promotion.runId, {
    ...storedPromotion,
    draft: {
      ...storedPromotion.draft,
      messages: storedPromotion.draft.messages.map(fromStoredMessage),
    },
  });
  const stored = readStoredPromotions();
  stored[promotion.runId] = storedPromotion;
  writeStoredPromotions(stored);
}

export function loadProvisionalChatPromotion(
  runId: string
): ProvisionalChatPromotion | null {
  const memoryPromotion = memoryPromotions.get(runId);
  if (memoryPromotion) return memoryPromotion;

  const stored = readStoredPromotions();
  const promotion = stored[runId];
  if (
    !promotion
    || typeof promotion.runId !== 'string'
    || typeof promotion.conversationId !== 'string'
    || typeof promotion.prompt !== 'string'
    || !promotion.draft
    || typeof promotion.draft !== 'object'
    || !Array.isArray(promotion.draft.messages)
  ) {
    return null;
  }

  try {
    const restored = {
      ...promotion.draft,
      messages: promotion.draft.messages.map(fromStoredMessage),
    };
    const result = {
      ...promotion,
      draft: restored,
    };
    memoryPromotions.set(runId, result);
    return result;
  } catch {
    delete stored[runId];
    writeStoredPromotions(stored);
    return null;
  }
}

export function removeProvisionalChatPromotion(runId: string) {
  memoryPromotions.delete(runId);
  const stored = readStoredPromotions();
  if (!stored[runId]) return;
  delete stored[runId];
  writeStoredPromotions(stored);
}

export function getDraftSelectionForPromotion(
  promotion: ProvisionalChatPromotion
): Extract<SelectedChat, { kind: 'draft' }> {
  return {
    kind: 'draft',
    draftId: promotion.draft.id,
    mentorId: promotion.draft.mentorId,
    workspaceId: promotion.draft.workspaceId,
  };
}

export function isDefinitivePreAcceptanceFailure(run: ChatRunSnapshot) {
  return (
    run.mode === 'persistent'
    && !run.acceptedAt
    && run.status === 'failed'
    && ['request_not_accepted', 'submission_rejected', 'run_conflict'].includes(
      run.errorCode ?? ''
    )
  );
}

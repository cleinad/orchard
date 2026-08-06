import type { ThreadMeta } from '@/app/home/components/threadTypes';
import type {
  BranchSelectionMap,
  ConversationBranch,
  Message,
} from '@/app/home/types';
import type { ConversationMetadataStatus } from '@/app/home/components/conversationTranscriptData';
import { mergeThreadsMaps } from '@/app/home/components/persistentThreadRuntime';

const READY_METADATA_STATUS: ConversationMetadataStatus = {
  branches: { status: 'ready' },
  threads: { status: 'ready' },
  attachments: { status: 'ready' },
};

export interface PersistentConversationTranscript {
  messages: Message[];
  branches: ConversationBranch[];
  selectedBranchIds: BranchSelectionMap;
  threadsMap: Map<string, ThreadMeta[]>;
  metadataStatus: ConversationMetadataStatus;
  isComplete: boolean;
  loadedAt: number;
}

export type PersistentConversationTranscriptRecord =
  Record<string, PersistentConversationTranscript>;

export type PersistentConversationTranscriptInput = Omit<
  PersistentConversationTranscript,
  'isComplete' | 'loadedAt' | 'metadataStatus'
> & {
  metadataStatus?: ConversationMetadataStatus;
  isComplete?: boolean;
  loadedAt?: number;
};

export function createEmptyPersistentConversationTranscript(
  loadedAt = Date.now()
): PersistentConversationTranscript {
  return {
    messages: [],
    branches: [],
    selectedBranchIds: {},
    threadsMap: new Map(),
    metadataStatus: READY_METADATA_STATUS,
    isComplete: true,
    loadedAt,
  };
}

export function normalizePersistentConversationTranscript(
  transcript: PersistentConversationTranscriptInput
): PersistentConversationTranscript {
  return {
    messages: transcript.messages,
    branches: transcript.branches,
    selectedBranchIds: transcript.selectedBranchIds,
    threadsMap: transcript.threadsMap,
    metadataStatus: transcript.metadataStatus ?? READY_METADATA_STATUS,
    isComplete: transcript.isComplete ?? true,
    loadedAt: transcript.loadedAt ?? Date.now(),
  };
}

function sortMessagesForRender(messages: Message[]) {
  return [...messages].sort((a, b) => {
    const byTime = a.timestamp.getTime() - b.timestamp.getTime();
    return byTime || a.id.localeCompare(b.id);
  });
}

function isLikelySamePersistedMessage(a: Message, b: Message) {
  return (
    a.role === b.role
    && a.content === b.content
    && Math.abs(a.timestamp.getTime() - b.timestamp.getTime()) < 60_000
  );
}

function getSearchActivityFromMessage(message: Message) {
  return (
    message.searchActivity
    ?? (
      message.searchMetadata?.version === 2
        ? message.searchMetadata.activity ?? null
        : null
    )
  );
}

function mergeReloadedMessages(params: {
  loadedMessages: Message[];
  currentMessages: Message[];
  baselineMessages?: Message[];
  preserveCurrentAttachments: boolean;
}) {
  const currentById = new Map(
    params.currentMessages.map((message) => [message.id, message])
  );
  const baselineById = new Map(
    (params.baselineMessages ?? []).map((message) => [message.id, message])
  );
  const usedCurrentRenderIds = new Set<string>();

  const mergedLoadedMessages = params.loadedMessages.map((loadedMessage) => {
    const currentByExactId = currentById.get(loadedMessage.id) ?? null;
    const currentMessage =
      currentByExactId
      ?? params.currentMessages.find((candidate) => {
        const candidateRenderId = candidate.renderId ?? candidate.id;
        return (
          !usedCurrentRenderIds.has(candidateRenderId)
          && isLikelySamePersistedMessage(candidate, loadedMessage)
        );
      })
      ?? null;

    if (!currentMessage) return loadedMessage;

    usedCurrentRenderIds.add(currentMessage.renderId ?? currentMessage.id);
    const baselineMessage = baselineById.get(currentMessage.id);
    const changedDuringLoad =
      params.baselineMessages !== undefined
      && baselineMessage !== currentMessage;

    if (currentMessage.isStreaming || changedDuringLoad) {
      return currentMessage;
    }

    return {
      ...loadedMessage,
      renderId: currentMessage.renderId ?? loadedMessage.renderId,
      attachments:
        params.preserveCurrentAttachments
          ? currentMessage.attachments ?? loadedMessage.attachments
          : loadedMessage.attachments,
      searchMetadata:
        currentMessage.searchMetadata ?? loadedMessage.searchMetadata ?? null,
      searchActivity:
        getSearchActivityFromMessage(currentMessage)
        ?? getSearchActivityFromMessage(loadedMessage),
    };
  });

  const loadedIds = new Set(params.loadedMessages.map((message) => message.id));
  const localMessagesMissingFromReload = params.currentMessages.filter((message) => {
    const renderId = message.renderId ?? message.id;
    return !usedCurrentRenderIds.has(renderId) && !loadedIds.has(message.id);
  });

  return sortMessagesForRender([
    ...mergedLoadedMessages,
    ...localMessagesMissingFromReload,
  ]);
}

export function mergeReloadedPersistentConversationTranscript(params: {
  loaded: PersistentConversationTranscript;
  current: PersistentConversationTranscript;
  baseline?: PersistentConversationTranscript | null;
  selectedBranchIds?: BranchSelectionMap;
}): PersistentConversationTranscript {
  const {
    loaded,
    current,
    baseline,
  } = params;
  const currentBranchesById = new Map(
    current.branches.map((branch) => [branch.id, branch])
  );
  const baselineBranchesById = new Map(
    (baseline?.branches ?? []).map((branch) => [branch.id, branch])
  );
  const loadedBranches =
    baseline === undefined
      ? loaded.branches
      : loaded.branches.map((branch) => {
          const currentBranch = currentBranchesById.get(branch.id);
          return (
            currentBranch
            && baselineBranchesById.get(branch.id) !== currentBranch
              ? currentBranch
              : branch
          );
        });
  const mergedBranchIds = new Set(loadedBranches.map((branch) => branch.id));
  const localBranchesAddedDuringLoad =
    baseline === undefined
      ? []
      : current.branches.filter(
          (branch) =>
            !mergedBranchIds.has(branch.id)
            && baselineBranchesById.get(branch.id) !== branch
        );
  const branches =
    loaded.metadataStatus.branches.status === 'unavailable'
      ? current.branches
      : [...loadedBranches, ...localBranchesAddedDuringLoad];
  const threadsMap =
    loaded.metadataStatus.threads.status === 'unavailable'
      ? current.threadsMap
      : mergeThreadsMaps(loaded.threadsMap, current.threadsMap);

  return {
    ...loaded,
    messages: mergeReloadedMessages({
      loadedMessages: loaded.messages,
      currentMessages: current.messages,
      baselineMessages: baseline?.messages,
      preserveCurrentAttachments:
        loaded.metadataStatus.attachments.status === 'unavailable',
    }),
    branches,
    selectedBranchIds:
      params.selectedBranchIds ?? {
        ...loaded.selectedBranchIds,
        ...current.selectedBranchIds,
      },
    threadsMap,
  };
}

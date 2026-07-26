import type {
  BranchSelectionMap,
  ConversationBranch,
  Message,
} from '@/app/home/types';
import {
  buildChildrenByPreviousId,
  getActualBranchesForSource,
  getActivePathMessages as getProjectedActivePathMessages,
  getDefaultBranch,
  getFirstChildMessage,
  normalizeMessages,
  sortBranches,
} from '@/app/home/components/conversationMapModel';
import {
  createTemporaryId,
  fallbackChatTitleFromMessage,
} from '@/lib/chat-session';

export interface PendingBranchTarget {
  sourceMessageId: string;
  tempBranchId: string;
  title: string;
}

export interface BranchChip {
  id: string;
  label: string;
  kind: 'branch' | 'pending' | 'fallback-main';
  branchId: string | null;
  isActive: boolean;
}

export function buildInitialBranchSelections(
  branches: ConversationBranch[]
): BranchSelectionMap {
  const grouped = new Map<string, ConversationBranch[]>();

  for (const branch of sortBranches(branches)) {
    const existing = grouped.get(branch.sourceMessageId);
    if (existing) {
      existing.push(branch);
    } else {
      grouped.set(branch.sourceMessageId, [branch]);
    }
  }

  const selections: BranchSelectionMap = {};

  for (const [sourceMessageId, sourceBranches] of grouped.entries()) {
    const nextBranch = getDefaultBranch(sourceBranches);
    if (nextBranch) {
      selections[sourceMessageId] = nextBranch.id;
    }
  }

  return selections;
}

export function createPendingBranchTarget(
  sourceMessageId: string
): PendingBranchTarget {
  return {
    sourceMessageId,
    tempBranchId: createTemporaryId('branch'),
    title: 'New branch',
  };
}

export function getActivePathMessages(params: {
  messages: Message[];
  branches: ConversationBranch[];
  selectedBranchIds: BranchSelectionMap;
  pendingBranch: PendingBranchTarget | null;
}) {
  return getProjectedActivePathMessages({
    messages: params.messages,
    branches: params.branches,
    selectedBranchIds: params.selectedBranchIds,
    pendingBranchSourceMessageId: params.pendingBranch?.sourceMessageId ?? null,
  });
}

export function getBranchChipsForMessage(params: {
  sourceMessageId: string;
  messages: Message[];
  branches: ConversationBranch[];
  selectedBranchIds: BranchSelectionMap;
  pendingBranch: PendingBranchTarget | null;
}) {
  const normalizedMessages = normalizeMessages(params.messages);
  const childrenByPreviousId = buildChildrenByPreviousId(normalizedMessages);
  const actualBranches = getActualBranchesForSource(params.branches, params.sourceMessageId);
  const hasPending = params.pendingBranch?.sourceMessageId === params.sourceMessageId;
  const defaultSelectedBranchId = getDefaultBranch(actualBranches)?.id ?? null;
  const selectedBranchId =
    params.selectedBranchIds[params.sourceMessageId] ?? defaultSelectedBranchId;
  const chips: BranchChip[] = [];

  if (actualBranches.length > 0) {
    chips.push(
      ...actualBranches.map((branch) => ({
        id: branch.id,
        label: branch.title,
        kind: 'branch' as const,
        branchId: branch.id,
        isActive: !hasPending && branch.id === selectedBranchId,
      }))
    );
  } else if (hasPending) {
    const fallbackMain = getFirstChildMessage(childrenByPreviousId, params.sourceMessageId);
    if (fallbackMain) {
      chips.push({
        id: `fallback-main:${params.sourceMessageId}`,
        label: 'Main',
        kind: 'fallback-main',
        branchId: null,
        isActive: false,
      });
    }
  }

  if (hasPending && params.pendingBranch) {
    chips.push({
      id: params.pendingBranch.tempBranchId,
      label: params.pendingBranch.title,
      kind: 'pending',
      branchId: null,
      isActive: true,
    });
  }

  return chips;
}

export function hasActualBranchesForMessage(
  branches: ConversationBranch[],
  sourceMessageId: string
) {
  return branches.some((branch) => branch.sourceMessageId === sourceMessageId);
}

export function applyUserMessageToTree(params: {
  messages: Message[];
  branches: ConversationBranch[];
  selectedBranchIds: BranchSelectionMap;
  pendingBranch: PendingBranchTarget | null;
  userMessage: Message;
  newBranchId?: string;
}) {
  const nextMessages = [...params.messages, params.userMessage];

  if (!params.pendingBranch) {
    return {
      messages: nextMessages,
      branches: params.branches,
      selectedBranchIds: params.selectedBranchIds,
      pendingBranch: null,
    };
  }

  const normalizedMessages = normalizeMessages(params.messages);
  const childrenByPreviousId = buildChildrenByPreviousId(normalizedMessages);
  const sourceMessageId = params.pendingBranch.sourceMessageId;
  const existingBranches = getActualBranchesForSource(params.branches, sourceMessageId);
  const nextBranches = [...params.branches];

  if (existingBranches.length === 0) {
    const currentMainEntry = getFirstChildMessage(childrenByPreviousId, sourceMessageId);
    if (currentMainEntry) {
      nextBranches.push({
        id: createTemporaryId('branch'),
        sourceMessageId,
        entryMessageId: currentMainEntry.id,
        title: 'Main',
        isMain: true,
        position: 0,
      });
    }
  }

  const nextPosition = getActualBranchesForSource(nextBranches, sourceMessageId).length;
  const newBranchId = params.newBranchId ?? createTemporaryId('branch');

  nextBranches.push({
    id: newBranchId,
    sourceMessageId,
    entryMessageId: params.userMessage.id,
    title: fallbackChatTitleFromMessage(params.userMessage.content, 'New branch'),
    isMain: false,
    position: nextPosition,
  });

  return {
    messages: nextMessages,
    branches: sortBranches(nextBranches),
    selectedBranchIds: {
      ...params.selectedBranchIds,
      [sourceMessageId]: newBranchId,
    },
    pendingBranch: null,
  };
}

export function getBranchPointMessages(params: {
  activePathMessages: Message[];
  branches: ConversationBranch[];
}) {
  return params.activePathMessages.filter(
    (message) =>
      message.role === 'assistant'
      && hasActualBranchesForMessage(params.branches, message.id)
  );
}

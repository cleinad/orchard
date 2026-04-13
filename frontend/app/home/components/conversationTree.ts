import type {
  BranchSelectionMap,
  ConversationBranch,
  Message,
} from '@/app/home/types';
import {
  createTemporaryId,
  fallbackChatTitleFromMessage,
} from '@/lib/chat-session';

const ROOT_KEY = '__root__';

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

function sortMessages(messages: Message[]) {
  return [...messages].sort((a, b) => {
    const byTime = a.timestamp.getTime() - b.timestamp.getTime();
    if (byTime !== 0) {
      return byTime;
    }

    return a.id.localeCompare(b.id);
  });
}

function sortBranches(branches: ConversationBranch[]) {
  return [...branches].sort((a, b) => {
    if (a.sourceMessageId !== b.sourceMessageId) {
      return a.sourceMessageId.localeCompare(b.sourceMessageId);
    }

    if (a.isMain !== b.isMain) {
      return a.isMain ? -1 : 1;
    }

    if (a.position !== b.position) {
      return a.position - b.position;
    }

    return a.id.localeCompare(b.id);
  });
}

function normalizeMessages(messages: Message[]) {
  const sorted = sortMessages(messages);
  const rootCount = sorted.filter((message) => message.previousMessageId === null).length;
  const hasAnyPreviousPointer = sorted.some((message) => message.previousMessageId !== null);

  if (hasAnyPreviousPointer && rootCount <= 1) {
    return sorted.map((message) => ({
      ...message,
      previousMessageId: message.previousMessageId ?? null,
    }));
  }

  return sorted.map((message, index) => ({
    ...message,
    previousMessageId: index === 0 ? null : sorted[index - 1].id,
  }));
}

function buildChildrenByPreviousId(messages: Message[]) {
  const map = new Map<string, Message[]>();

  for (const message of messages) {
    const key = message.previousMessageId ?? ROOT_KEY;
    const existing = map.get(key);

    if (existing) {
      existing.push(message);
    } else {
      map.set(key, [message]);
    }
  }

  return map;
}

function getActualBranchesForSource(
  branches: ConversationBranch[],
  sourceMessageId: string
) {
  return sortBranches(
    branches.filter((branch) => branch.sourceMessageId === sourceMessageId)
  );
}

function getDefaultBranch(branches: ConversationBranch[]) {
  return (
    branches.find((branch) => branch.isMain) ||
    sortBranches(branches)[0] ||
    null
  );
}

function getFirstChildMessage(
  childrenByPreviousId: Map<string, Message[]>,
  sourceMessageId: string
) {
  return childrenByPreviousId.get(sourceMessageId)?.[0] ?? null;
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
  const normalizedMessages = normalizeMessages(params.messages);
  const messageById = new Map(normalizedMessages.map((message) => [message.id, message]));
  const childrenByPreviousId = buildChildrenByPreviousId(normalizedMessages);
  const path: Message[] = [];
  const seen = new Set<string>();

  let current = childrenByPreviousId.get(ROOT_KEY)?.[0] ?? null;

  while (current && !seen.has(current.id)) {
    path.push(current);
    seen.add(current.id);

    if (
      current.role === 'assistant'
      && params.pendingBranch?.sourceMessageId === current.id
    ) {
      break;
    }

    let nextMessage: Message | null = null;
    if (current.role === 'assistant') {
      const branches = getActualBranchesForSource(params.branches, current.id);
      if (branches.length > 0) {
        const selectedBranchId =
          params.selectedBranchIds[current.id] ?? getDefaultBranch(branches)?.id ?? null;
        const selectedBranch =
          branches.find((branch) => branch.id === selectedBranchId) ??
          getDefaultBranch(branches);
        if (selectedBranch) {
          nextMessage = messageById.get(selectedBranch.entryMessageId) ?? null;
        }
      }
    }

    if (!nextMessage) {
      nextMessage = getFirstChildMessage(childrenByPreviousId, current.id);
    }

    current = nextMessage;
  }

  return path;
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
  let nextBranches = [...params.branches];

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
  const newBranchId = createTemporaryId('branch');

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

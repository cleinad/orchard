import type { ThreadMeta } from '@/app/home/components/threadTypes';
import type {
  BranchSelectionMap,
  ConversationBranch,
  Message,
} from '@/app/home/types';

export interface PersistentConversationTranscript {
  messages: Message[];
  branches: ConversationBranch[];
  selectedBranchIds: BranchSelectionMap;
  threadsMap: Map<string, ThreadMeta[]>;
  loadedAt: number;
}

export type PersistentConversationTranscriptRecord =
  Record<string, PersistentConversationTranscript>;

export type PersistentConversationTranscriptInput = Omit<
  PersistentConversationTranscript,
  'loadedAt'
> & {
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
    loadedAt: transcript.loadedAt ?? Date.now(),
  };
}

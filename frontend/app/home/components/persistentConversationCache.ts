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
  isComplete: boolean;
  loadedAt: number;
}

export type PersistentConversationTranscriptRecord =
  Record<string, PersistentConversationTranscript>;

export type PersistentConversationTranscriptInput = Omit<
  PersistentConversationTranscript,
  'isComplete' | 'loadedAt'
> & {
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
    isComplete: transcript.isComplete ?? true,
    loadedAt: transcript.loadedAt ?? Date.now(),
  };
}

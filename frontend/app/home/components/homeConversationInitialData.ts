import type { ThreadMeta } from '@/app/home/components/threadTypes';
import type {
  PersistentConversationTranscript,
  PersistentConversationTranscriptInput,
} from '@/app/home/components/persistentConversationCache';
import type {
  BranchSelectionMap,
  ConversationBranch,
  ConversationListItem,
  Message,
} from '@/app/home/types';

export interface SerializedConversationTranscript {
  messages: Message[];
  branches: ConversationBranch[];
  selectedBranchIds: BranchSelectionMap;
  threadEntries: Array<[string, ThreadMeta[]]>;
  isComplete: boolean;
  loadedAt: number;
}

export interface HomeConversationInitialData {
  conversation: ConversationListItem;
  transcript: SerializedConversationTranscript;
}

export function serializeConversationTranscript(
  transcript: PersistentConversationTranscriptInput
): SerializedConversationTranscript {
  return {
    messages: transcript.messages,
    branches: transcript.branches,
    selectedBranchIds: transcript.selectedBranchIds,
    threadEntries: [...transcript.threadsMap.entries()],
    isComplete: transcript.isComplete ?? true,
    loadedAt: transcript.loadedAt ?? Date.now(),
  };
}

export function hydrateConversationTranscript(
  transcript: SerializedConversationTranscript
): PersistentConversationTranscript {
  return {
    messages: transcript.messages,
    branches: transcript.branches,
    selectedBranchIds: transcript.selectedBranchIds,
    threadsMap: new Map(transcript.threadEntries),
    isComplete: transcript.isComplete,
    loadedAt: transcript.loadedAt,
  };
}

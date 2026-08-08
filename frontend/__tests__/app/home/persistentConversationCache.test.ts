import { describe, expect, it } from 'vitest';
import {
  mergeReloadedPersistentConversationTranscript,
  normalizePersistentConversationTranscript,
  type PersistentConversationTranscript,
} from '@/app/home/components/persistentConversationCache';
import type { ConversationMetadataStatus } from '@/app/home/components/conversationTranscriptData';
import type { Message } from '@/app/home/types';

const READY: ConversationMetadataStatus = {
  branches: { status: 'ready' },
  threads: { status: 'ready' },
  attachments: { status: 'ready' },
};

function message(
  content: string,
  overrides: Partial<Message> = {}
): Message {
  return {
    id: 'assistant-1',
    role: 'assistant',
    content,
    timestamp: new Date('2026-08-06T12:00:00.000Z'),
    previousMessageId: 'user-1',
    ...overrides,
  };
}

function transcript(
  messages: Message[],
  overrides: Partial<PersistentConversationTranscript> = {}
) {
  return normalizePersistentConversationTranscript({
    messages,
    branches: [],
    selectedBranchIds: {},
    threadsMap: new Map(),
    metadataStatus: READY,
    loadedAt: 1,
    ...overrides,
  });
}

describe('mergeReloadedPersistentConversationTranscript', () => {
  it('preserves a same-id streaming message updated after the retry began', () => {
    const baselineMessage = message('partial');
    const baseline = transcript([baselineMessage]);
    const currentMessage = {
      ...baselineMessage,
      content: 'partial plus newer streamed content',
      isStreaming: true,
    };
    const current = transcript([currentMessage]);
    const loaded = transcript([message('older persisted content')], {
      loadedAt: 2,
    });

    const merged = mergeReloadedPersistentConversationTranscript({
      loaded,
      current,
      baseline,
    });

    expect(merged.messages).toHaveLength(1);
    expect(merged.messages[0]).toBe(currentMessage);
  });

  it('keeps available local metadata while reporting each failed reload resource', () => {
    const localAttachment = {
      id: 'attachment-1',
      storagePath: 'user/conversation/image.png',
      fileName: 'image.png',
      mimeType: 'image/png' as const,
      sizeBytes: 123,
    };
    const localBranch = {
      id: 'branch-local',
      sourceMessageId: 'assistant-1',
      entryMessageId: 'assistant-2',
      title: 'Local branch',
      isMain: false,
      position: 1,
    };
    const localThread = {
      threadId: 'thread-local',
      sourceMessageId: 'assistant-1',
      highlightedText: 'newer local thread',
      startOffset: 0,
      endOffset: 5,
    };
    const current = transcript(
      [message('persisted content', { attachments: [localAttachment] })],
      {
        branches: [localBranch],
        selectedBranchIds: { 'assistant-1': localBranch.id },
        threadsMap: new Map([['assistant-1', [localThread]]]),
      }
    );
    const unavailable: ConversationMetadataStatus = {
      branches: { status: 'unavailable', reason: 'error' },
      threads: { status: 'unavailable', reason: 'timeout' },
      attachments: { status: 'unavailable', reason: 'error' },
    };
    const loaded = transcript([message('persisted content')], {
      metadataStatus: unavailable,
      loadedAt: 2,
    });

    const merged = mergeReloadedPersistentConversationTranscript({
      loaded,
      current,
    });

    expect(merged.metadataStatus).toEqual(unavailable);
    expect(merged.branches).toEqual([localBranch]);
    expect(merged.threadsMap.get('assistant-1')).toEqual([localThread]);
    expect(merged.messages[0].attachments).toEqual([localAttachment]);
  });

  it('clears stale degradation status after a successful focused reload', () => {
    const current = transcript([message('old content')], {
      metadataStatus: {
        branches: { status: 'unavailable', reason: 'error' },
        threads: { status: 'unavailable', reason: 'error' },
        attachments: { status: 'unavailable', reason: 'error' },
      },
    });
    const loaded = transcript([message('fresh content')], {
      loadedAt: 2,
    });

    const merged = mergeReloadedPersistentConversationTranscript({
      loaded,
      current,
    });

    expect(merged.metadataStatus).toEqual(READY);
    expect(merged.messages[0].content).toBe('fresh content');
  });
});

import { describe, expect, it, vi } from 'vitest';
import {
  mergeReloadedBranchSelections,
  readChatStream,
} from '@/app/home/components/useMainChatRuntime';
import type { ConversationBranch } from '@/app/home/types';
import type { SearchActivitySummary } from '@/lib/search/types';

function streamResponse(parts: Record<string, unknown>[]) {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const part of parts) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(part)}\n\n`));
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      },
    }),
    {
      headers: { 'content-type': 'text/event-stream' },
    }
  );
}

describe('readChatStream', () => {
  it('parses search activity data parts while streaming text', async () => {
    const activity: SearchActivitySummary = {
      collapsedLabel: 'Searching fresh results',
      events: [
        {
          type: 'search_started',
          query: 'OpenAI updates',
          attempt: 1,
        },
      ],
    };
    const onChunk = vi.fn();
    const onSearchActivity = vi.fn();

    const metadata = await readChatStream(
      streamResponse([
        {
          type: 'data-searchActivity',
          data: activity,
        },
        {
          type: 'text-delta',
          delta: 'Hello',
        },
        {
          type: 'data-chatMeta',
          data: {
            message: 'Hello',
            searchActivity: activity,
          },
        },
      ]),
      onChunk,
      { onSearchActivity }
    );

    expect(onChunk).toHaveBeenCalledWith('Hello');
    expect(onSearchActivity).toHaveBeenCalledWith(activity);
    expect(metadata).toMatchObject({
      message: 'Hello',
      searchActivity: activity,
    });
  });
});

describe('mergeReloadedBranchSelections', () => {
  const branches: ConversationBranch[] = [
    {
      id: 'branch-main',
      sourceMessageId: 'assistant-root',
      entryMessageId: 'user-main',
      title: 'Main',
      isMain: true,
      position: 0,
    },
    {
      id: 'branch-alternate',
      sourceMessageId: 'assistant-root',
      entryMessageId: 'user-alternate',
      title: 'Alternate',
      isMain: false,
      position: 1,
    },
  ];

  it('preserves a valid cached selection over the loaded default', () => {
    expect(mergeReloadedBranchSelections({
      loadedSelectedBranchIds: { 'assistant-root': 'branch-main' },
      latestSelectedBranchIds: { 'assistant-root': 'branch-alternate' },
      loadedBranches: branches,
      branchSourceMessageId: null,
      pendingBranchSelectionId: null,
    })).toEqual({ 'assistant-root': 'branch-alternate' });
  });

  it('falls back to the loaded default when the cached branch no longer exists', () => {
    expect(mergeReloadedBranchSelections({
      loadedSelectedBranchIds: { 'assistant-root': 'branch-main' },
      latestSelectedBranchIds: { 'assistant-root': 'branch-deleted' },
      loadedBranches: branches,
      branchSourceMessageId: null,
      pendingBranchSelectionId: null,
    })).toEqual({ 'assistant-root': 'branch-main' });
  });

  it('resolves an optimistic branch selection to the newly loaded branch', () => {
    expect(mergeReloadedBranchSelections({
      loadedSelectedBranchIds: { 'assistant-root': 'branch-main' },
      latestSelectedBranchIds: { 'assistant-root': 'branch-optimistic' },
      loadedBranches: branches,
      branchSourceMessageId: 'assistant-root',
      pendingBranchSelectionId: 'branch-optimistic',
    })).toEqual({ 'assistant-root': 'branch-alternate' });
  });
});

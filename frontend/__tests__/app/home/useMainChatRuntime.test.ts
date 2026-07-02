import { describe, expect, it, vi } from 'vitest';
import { readChatStream } from '@/app/home/components/useMainChatRuntime';
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

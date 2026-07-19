function deferred() {
  let resolve;
  let reject;

  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

async function mockStreamingChatRoute(page, {
  chunks,
  metadata,
  delayMs = 400,
}) {
  await page.addInitScript(({ streamChunks, streamMetadata, streamDelayMs }) => {
    const originalFetch = window.fetch.bind(window);

    window.fetch = (input, init) => {
      const url = new URL(
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
        window.location.href
      );
      if (url.pathname !== '/api/chat') {
        return originalFetch(input, init);
      }

      const encoder = new TextEncoder();
      const body = new ReadableStream({
        start(controller) {
          let chunkIndex = 0;
          const writeNext = () => {
            if (chunkIndex < streamChunks.length) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: 'text-delta',
                delta: streamChunks[chunkIndex],
              })}\n\n`));
              chunkIndex += 1;
              window.setTimeout(writeNext, streamDelayMs);
              return;
            }

            controller.enqueue(encoder.encode('data: {"type":"text-end"}\n\n'));
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              type: 'data-chatMeta',
              data: {
                ...streamMetadata,
                message: streamChunks.join(''),
              },
            })}\n\n`));
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
          };

          writeNext();
        },
      });

      return Promise.resolve(new Response(body, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }));
    };
  }, {
    streamChunks: chunks,
    streamMetadata: metadata,
    streamDelayMs: delayMs,
  });
}

function normalizeRouteResult(result) {
  if (result && typeof result === 'object' && 'json' in result) {
    return {
      status: result.status ?? 200,
      headers: result.headers ?? {},
      json: result.json,
    };
  }

  return {
    status: 200,
    headers: {},
    json: result,
  };
}

async function mockChatRoute(page, handler) {
  await page.route('**/api/chat', async (route) => {
    const body = route.request().postDataJSON();
    const result = normalizeRouteResult(await handler(body, route.request()));
    if (result.status >= 200 && result.status < 300) {
      const events = [];
      if (typeof result.json.message === 'string' && result.json.message.length > 0) {
        events.push({ type: 'text-delta', delta: result.json.message });
      }
      events.push({ type: 'text-end' });
      events.push({ type: 'data-chatMeta', data: result.json });
      events.push('[DONE]');

      await route.fulfill({
        status: result.status,
        headers: result.headers,
        contentType: 'text/event-stream',
        body: events
          .map((event) => `data: ${typeof event === 'string' ? event : JSON.stringify(event)}\n\n`)
          .join(''),
      });
      return;
    }

    await route.fulfill({
      status: result.status,
      headers: result.headers,
      contentType: 'application/json',
      body: JSON.stringify(result.json),
    });
  });
}

async function mockThreadMessagesRoute(page, handler) {
  await page.route('**/api/threads/*/messages', async (route) => {
    const url = new URL(route.request().url());
    const match = url.pathname.match(/\/api\/threads\/([^/]+)\/messages$/);
    const threadId = match ? decodeURIComponent(match[1]) : null;
    const result = normalizeRouteResult(await handler({ threadId, request: route.request() }));
    await route.fulfill({
      status: result.status,
      headers: result.headers,
      contentType: 'application/json',
      body: JSON.stringify(result.json),
    });
  });
}

module.exports = {
  deferred,
  mockChatRoute,
  mockStreamingChatRoute,
  mockThreadMessagesRoute,
};

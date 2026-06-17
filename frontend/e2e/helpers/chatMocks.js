function deferred() {
  let resolve;
  let reject;

  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
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

function toSseLine(part) {
  return `data: ${JSON.stringify(part)}\n\n`;
}

function toChatStreamBody(json) {
  const message = typeof json?.message === 'string' ? json.message : '';

  return [
    ...(message ? [toSseLine({ type: 'text-delta', delta: message })] : []),
    toSseLine({ type: 'text-end' }),
    toSseLine({ type: 'data-chatMeta', data: json }),
    'data: [DONE]\n\n',
  ].join('');
}

async function mockChatRoute(page, handler) {
  await page.context().route(/\/api\/chat\/?(?:\?.*)?$/, async (route) => {
    const request = route.request();
    if (request.method() !== 'POST') {
      await route.fallback();
      return;
    }

    const body = request.postDataJSON();
    let result;

    try {
      result = normalizeRouteResult(await handler(body, request));
    } catch (error) {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          error: error instanceof Error ? error.message : String(error),
        }),
      });
      return;
    }

    if (result.status >= 400) {
      await route.fulfill({
        status: result.status,
        headers: result.headers,
        contentType: 'application/json',
        body: JSON.stringify(result.json),
      });
      return;
    }

    await route.fulfill({
      status: result.status,
      headers: result.headers,
      contentType: 'text/event-stream',
      body: toChatStreamBody(result.json),
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
  mockThreadMessagesRoute,
};

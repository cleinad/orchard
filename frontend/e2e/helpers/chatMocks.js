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

async function mockChatRoute(page, handler) {
  await page.route('**/api/chat', async (route) => {
    const body = route.request().postDataJSON();
    const result = normalizeRouteResult(await handler(body, route.request()));
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
  mockThreadMessagesRoute,
};

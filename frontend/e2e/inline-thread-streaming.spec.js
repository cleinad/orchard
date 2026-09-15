const { test, expect } = require('@playwright/test');
const { gotoHomeFixture } = require('./helpers/homeFixture');
const { selectTextInMessage } = require('./helpers/selectText');

// Keep the response open until assertions have observed each stream phase.
async function installControlledStream(page) {
  await page.addInitScript(() => {
    const originalFetch = window.fetch.bind(window);
    window.threadStreams = [];
    window.fetch = (input, init) => {
      if (String(input) !== '/api/chat') return originalFetch(input, init);
      const request = JSON.parse(init.body);
      const encoder = new TextEncoder();
      const body = new ReadableStream({
        start(controller) {
          const stream = {
            request,
            emit(event) { controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`)); },
            finish(message = 'Partial answer finished.', run) {
              stream.emit({ type: 'data-chatMeta', data: {
                message,
                ...(run ? { run } : {}),
                threadId: request.run.target.threadId,
                userMessageId: request.run.userMessageId,
                assistantMessageId: request.run.assistantMessageId,
              } });
              controller.close();
            },
          };
          init.signal?.addEventListener('abort', () => controller.error(new DOMException('Aborted', 'AbortError')));
          window.threadStreams.push(stream);
        },
      });
      return Promise.resolve(new Response(body, { headers: { 'Content-Type': 'text/event-stream' } }));
    };
  });
}

function terminalRun(request, status) {
  const now = new Date().toISOString();
  return {
    runId: request.run.runId, mode: request.chatMode, status, target: request.run.target,
    userMessageId: request.run.userMessageId, assistantMessageId: request.run.assistantMessageId,
    createdThreadId: request.run.target.threadId, createdBranchId: null,
    response: null, search: null, searchActivity: null,
    title: { value: null, source: 'fallback', version: 0, runId: request.run.runId },
    subsystems: { response: status, title: 'skipped', search: 'skipped' },
    errorCode: status === 'failed' ? 'provider_error' : null,
    errorMessage: status === 'failed' ? 'Thread generation failed.' : null,
    acceptedAt: now, updatedAt: now, completedAt: now, expiresAt: null,
  };
}

async function startThread(page, fixture) {
  const { messageId, selectedText } = await gotoHomeFixture(page, fixture);
  await selectTextInMessage(page, messageId, selectedText);
  await page.getByTestId('selection-popover-input').fill('Explain this passage');
  await page.getByTestId('selection-popover-input').press('Enter');
  await expect.poll(() => page.evaluate(() => window.threadStreams.length)).toBe(1);
  return page.getByTestId('thread-panel');
}

for (const mode of ['temporary', 'persistent']) {
  test(`${mode} thread renders thinking, reasoning, search, and partial text before completion`, async ({ page }) => {
    await installControlledStream(page);
    await page.route('**/api/threads/*/messages', (route) => route.fulfill({ json: { messages: [] } }));
    const panel = await startThread(page, mode === 'temporary' ? 'inline-threads' : 'inline-threads-persistent');
    await expect(panel.getByTestId('response-activity')).toContainText('Thinking');
    await page.evaluate(() => {
      window.threadStreams[0].emit({ type: 'reasoning-delta', id: 'r1', delta: 'Checking the passage.' });
      window.threadStreams[0].emit({ type: 'data-searchActivity', data: {
        collapsedLabel: 'Searching',
        events: [{ type: 'search_started', query: 'event loop ordering', attempt: 1 }],
      } });
    });
    await expect(panel.getByTestId('response-activity')).toContainText('Checking the passage.');
    await expect(panel.getByTestId('response-activity')).toContainText('Searching event loop ordering');
    await page.evaluate(() => window.threadStreams[0].emit({ type: 'text-delta', delta: 'Partial answer' }));
    await expect(panel).toContainText('Partial answer');
    await expect(panel.getByTestId('response-activity')).toContainText('Writing');
    await expect(panel.getByRole('button', { name: 'Stop response' })).toBeEnabled();
    await page.evaluate(() => window.threadStreams[0].finish());
    await expect(panel.getByRole('button', { name: 'Send', exact: true })).toBeVisible();
    await expect(panel.getByText('Partial answer finished.', { exact: true })).toHaveCount(1);
    await expect(panel.getByRole('status', { name: 'Generating response' })).toHaveCount(0);
    const stored = await page.evaluate(() => Object.values(sessionStorage).join(''));
    expect(stored).not.toContain('Checking the passage.');
  });
}

for (const mode of ['temporary', 'persistent']) {
for (const afterToken of [false, true]) {
  test(`${mode} thread Stop ${afterToken ? 'after' : 'before'} first token removes the placeholder`, async ({ page }) => {
    await installControlledStream(page);
    if (mode === 'persistent') {
      const cancel = async (route) => {
        const request = await page.evaluate(() => window.threadStreams[0].request);
        await route.fulfill({ json: { run: terminalRun(request, 'cancelled') } });
      };
      await page.route('**/api/chat-runs/*', cancel);
      await page.route('**/api/chat-runs/*/cancel', cancel);
      await page.route('**/api/threads/*/messages', (route) => route.fulfill({ json: { messages: [] } }));
    }
    const panel = await startThread(page, mode === 'temporary' ? 'inline-threads' : 'inline-threads-persistent');
    if (afterToken) {
      await page.evaluate(() => window.threadStreams[0].emit({ type: 'text-delta', delta: 'Partial answer' }));
      await expect(panel).toContainText('Partial answer');
    }
    await panel.getByRole('button', { name: 'Stop response' }).click();
    await expect(panel.getByRole('button', { name: 'Send', exact: true })).toBeVisible();
    await expect(panel.getByRole('status', { name: 'Generating response' })).toHaveCount(0);
    await expect(panel).not.toContainText('Partial answer');
  });
}

}

test('a delayed persistent reconciliation preserves the next turn and its loading status', async ({ page }) => {
  await installControlledStream(page);
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let requested = false;
  await page.route('**/api/threads/*/messages', async (route) => {
    requested = true;
    await gate;
    await route.fulfill({ json: { messages: [] } });
  });
  const panel = await startThread(page, 'inline-threads-persistent');
  await page.evaluate(() => window.threadStreams[0].finish());
  await expect(panel.getByRole('button', { name: 'Send', exact: true })).toBeVisible();
  await expect.poll(() => requested).toBe(true);
  await panel.getByTestId('thread-panel-input').fill('Continue');
  await panel.getByTestId('thread-panel-input').press('Enter');
  await expect.poll(() => page.evaluate(() => window.threadStreams.length)).toBe(2);
  await page.evaluate(() => window.threadStreams[1].emit({ type: 'text-delta', delta: 'Newer partial reply' }));
  await expect(panel).toContainText('Newer partial reply');
  const reconciled = page.waitForResponse('**/api/threads/*/messages');
  release();
  await reconciled;
  await expect(panel).toContainText('Newer partial reply');
  await expect(panel.getByRole('button', { name: 'Stop response' })).toBeEnabled();
  await page.evaluate(() => window.threadStreams[1].finish('Newer final reply'));
  await expect(panel.getByText('Newer final reply', { exact: true })).toHaveCount(1);
  await expect(panel.getByText('Partial answer finished.', { exact: true })).toHaveCount(1);
});

for (const mode of ['temporary', 'persistent']) {
  test(`${mode} stream failure replaces the partial reply with one error`, async ({ page }) => {
    await installControlledStream(page);
    const panel = await startThread(page, mode === 'temporary' ? 'inline-threads' : 'inline-threads-persistent');
    await page.evaluate(() => window.threadStreams[0].emit({ type: 'text-delta', delta: 'Partial answer' }));
    await expect(panel).toContainText('Partial answer');
    const request = await page.evaluate(() => window.threadStreams[0].request);
    await page.evaluate((run) => window.threadStreams[0].finish('', run), terminalRun(request, 'failed'));
    await expect(panel.getByText('Thread generation failed.', { exact: true })).toHaveCount(1);
    await expect(panel).not.toContainText('Partial answer');
    await expect(panel.getByRole('status', { name: 'Generating response' })).toHaveCount(0);
    await expect(panel.getByRole('button', { name: 'Send', exact: true })).toBeVisible();
  });
}

test('Stop retains a confirmed reply after repeated cancellation recovery', async ({ page }) => {
  await installControlledStream(page);
  let cancelled;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  await page.route('**/api/chat-runs/*/cancel', async (route) => {
    const request = await page.evaluate(() => window.threadStreams[0].request);
    cancelled = terminalRun(request, 'cancelled');
    await route.fulfill({ json: { run: cancelled } });
  });
  await page.route('**/api/chat-runs/*', async (route) => {
    await gate;
    await route.fulfill({ json: { run: cancelled } });
  });
  await page.route('**/api/threads/*/messages', async (route) => {
    await route.fulfill({ json: { messages: [{
      id: cancelled.assistantMessageId, role: 'assistant', content: 'Committed before Stop.',
      created_at: cancelled.updatedAt,
    }] } });
  });
  const panel = await startThread(page, 'inline-threads-persistent');
  await panel.getByRole('button', { name: 'Stop response' }).click();
  await expect(panel.getByText('Committed before Stop.', { exact: true })).toHaveCount(1);
  const reconciled = page.waitForResponse((response) => response.url().endsWith(`/api/chat-runs/${cancelled.runId}`));
  release();
  await reconciled;
  await panel.getByTestId('thread-panel-input').fill('Continue after the committed reply');
  await panel.getByTestId('thread-panel-input').press('Enter');
  await expect.poll(() => page.evaluate(() => window.threadStreams.length)).toBe(2);
  const predecessor = await page.evaluate(() => window.threadStreams[1].request.run.target.expectedPredecessorId);
  expect(predecessor).toBe(cancelled.assistantMessageId);
  await expect(panel.getByText('Committed before Stop.', { exact: true })).toHaveCount(1);
  await page.evaluate(() => window.threadStreams[1].finish('Next reply.'));
});

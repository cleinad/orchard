const { test, expect } = require('@playwright/test');
const {
  mockChatRoute,
  mockThreadMessagesRoute,
} = require('./helpers/chatMocks');
const {
  gotoHomeFixture,
  INLINE_THREADS_SELECTED_TEXT,
} = require('./helpers/homeFixture');
const { selectTextInMessage } = require('./helpers/selectText');
const { mockHomeDataRoutes } = require('./helpers/homeRouteMocks');

const PERSISTENT_SWITCH_CONTENT =
  'The event loop drains microtasks before the browser paints the next frame.';
const PERSISTENT_SWITCH_SELECTION =
  'microtasks before the browser paints';

function persistentThreadRunSnapshot(run, status = 'completed') {
  const now = new Date().toISOString();
  const completed = status === 'completed';

  return {
    runId: run.runId,
    mode: 'persistent',
    status,
    target: run.target,
    userMessageId: run.userMessageId,
    assistantMessageId: run.assistantMessageId,
    createdThreadId: run.newThreadId,
    createdBranchId: null,
    response: completed ? 'Recovered persistent thread answer.' : null,
    search: null,
    searchActivity: null,
    title: {
      value: null,
      source: 'fallback',
      version: 0,
      runId: run.runId,
    },
    subsystems: {
      response: completed ? 'completed' : 'running',
      title: 'skipped',
      search: 'skipped',
    },
    errorCode: null,
    errorMessage: null,
    acceptedAt: now,
    updatedAt: now,
    completedAt: completed ? now : null,
    expiresAt: null,
  };
}

async function getInlineThreadStartOffset(page, messageId, threadId) {
  return page.evaluate(({ messageId, threadId }) => {
    const message = document.querySelector(`[data-message-id="${messageId}"]`);
    const content = message?.querySelector('[data-message-content]');
    const target = content?.querySelector(
      `[data-testid="inline-thread-link"][data-thread-id="${threadId}"]`
    );

    if (!(content instanceof HTMLElement) || !(target instanceof HTMLElement)) {
      return null;
    }

    let offset = 0;

    const walk = (node) => {
      if (node === target) {
        return true;
      }

      if (node.nodeType === Node.TEXT_NODE) {
        offset += node.textContent?.length || 0;
        return false;
      }

      for (const child of node.childNodes) {
        if (walk(child)) {
          return true;
        }
      }

      return false;
    };

    walk(content);
    return offset;
  }, { messageId, threadId });
}

test('reopens a persisted inline thread from the source message', async ({ page }) => {
  const question = 'How should I reason about this in React?';
  const answer = 'Think of microtasks as work that finishes before the browser can paint.';
  let persistedThreadId = null;
  let persistedUserMessageId = null;
  let persistedAssistantMessageId = null;

  await mockChatRoute(page, async (body) => {
    expect(body.concise).toBeUndefined();
    expect(body.message).toBe(question);
    expect(body.conversationId).toBe('conversation-inline-threads-fixture');
    persistedThreadId = body.run.newThreadId;
    persistedUserMessageId = body.run.userMessageId;
    persistedAssistantMessageId = body.run.assistantMessageId;

    return {
      threadId: persistedThreadId,
      userMessageId: persistedUserMessageId,
      assistantMessageId: persistedAssistantMessageId,
      message: answer,
    };
  });

  await mockThreadMessagesRoute(page, async ({ threadId }) => {
    expect(threadId).toBe(persistedThreadId);
    return {
      messages: [
        {
          id: persistedUserMessageId,
          role: 'user',
          content: question,
          created_at: '2026-04-05T09:00:01.000Z',
        },
        {
          id: persistedAssistantMessageId,
          role: 'assistant',
          content: answer,
          created_at: '2026-04-05T09:00:02.000Z',
        },
      ],
    };
  });

  const { messageId, selectedText } = await gotoHomeFixture(page, 'inline-threads-persistent');
  await selectTextInMessage(page, messageId, selectedText);
  await page.getByTestId('selection-popover-input').fill(question);
  await page.getByTestId('selection-popover-input').press('Enter');

  await expect(page.getByTestId('thread-panel')).toContainText(answer);
  await expect(page.getByTestId('inline-thread-link')).toHaveCount(1);

  await page.keyboard.press('Control+L');
  await expect(page.getByTestId('thread-panel')).toHaveAttribute('data-state', 'closed');

  const threadLink = page.getByTestId('inline-thread-link');
  await expect(threadLink).toContainText(selectedText);
  await threadLink.click();

  await expect(page.getByTestId('thread-panel')).toHaveAttribute('data-state', 'open');
  await expect(page.getByTestId('thread-panel')).toContainText(question);
  await expect(page.getByTestId('thread-panel')).toContainText(answer);
});

test('persistent thread completion survives switching to another chat', async ({ page }) => {
  const firstConversationId = '20000000-0000-4000-8000-000000000021';
  const secondConversationId = '20000000-0000-4000-8000-000000000022';
  const sourceMessageId = '30000000-0000-4000-8000-000000000021';
  const question = 'Why is this ordering important?';
  const answer = 'It keeps state changes ahead of the next visible frame.';
  let pendingResponseResolve;
  let submittedThreadId = null;
  const pendingResponse = new Promise((resolve) => {
    pendingResponseResolve = resolve;
  });
  const now = '2026-07-20T12:00:00.000Z';

  await mockHomeDataRoutes(page, {
    conversations: [
      {
        id: firstConversationId,
        title: 'Thread Source Chat',
        mentor_id: null,
        workspace_id: null,
        created_at: now,
        updated_at: '2026-07-20T12:02:00.000Z',
      },
      {
        id: secondConversationId,
        title: 'Other Chat',
        mentor_id: null,
        workspace_id: null,
        created_at: now,
        updated_at: '2026-07-20T12:01:00.000Z',
      },
    ],
    messagesByConversationId: {
      [firstConversationId]: [{
        id: sourceMessageId,
        role: 'assistant',
        content: PERSISTENT_SWITCH_CONTENT,
        previous_message_id: null,
        created_at: now,
        search_metadata: null,
      }],
      [secondConversationId]: [{
        id: '30000000-0000-4000-8000-000000000022',
        role: 'assistant',
        content: 'This conversation should remain independent.',
        previous_message_id: null,
        created_at: now,
        search_metadata: null,
      }],
    },
  });

  await mockChatRoute(page, async (body) => {
    submittedThreadId = body.run.newThreadId;
    return pendingResponse;
  });
  await mockThreadMessagesRoute(page, async ({ threadId }) => ({
    thread: {
      threadId,
      conversationId: firstConversationId,
      sourceMessageId,
      highlightedText: PERSISTENT_SWITCH_SELECTION,
      startOffset: PERSISTENT_SWITCH_CONTENT.indexOf(PERSISTENT_SWITCH_SELECTION),
      endOffset:
        PERSISTENT_SWITCH_CONTENT.indexOf(PERSISTENT_SWITCH_SELECTION)
        + PERSISTENT_SWITCH_SELECTION.length,
      selectionStreamVersion: 'v2',
    },
    messages: [
      {
        id: '40000000-0000-4000-8000-000000000021',
        role: 'user',
        content: question,
        created_at: '2026-07-20T12:03:00.000Z',
      },
      {
        id: '50000000-0000-4000-8000-000000000021',
        role: 'assistant',
        content: answer,
        created_at: '2026-07-20T12:03:01.000Z',
      },
    ],
  }));

  await page.addInitScript(() => {
    window.localStorage.setItem('learningMode', 'true');
  });
  await page.goto(`/home/${firstConversationId}?e2e=persistent-thread-switch`);
  await page.waitForSelector(`[data-message-id="${sourceMessageId}"]`);
  await selectTextInMessage(page, sourceMessageId, PERSISTENT_SWITCH_SELECTION);
  await page.getByTestId('selection-popover-input').fill(question);
  await page.getByTestId('selection-popover-input').press('Enter');
  await expect(page.locator(
    '[data-testid="inline-thread-link"][data-thread-status="loading"]'
  )).toContainText(PERSISTENT_SWITCH_SELECTION);

  await page.getByRole('button', { name: 'Open conversations' }).click();
  await page.getByRole('button', { name: /Other Chat/ }).click();
  await expect(page).toHaveURL(
    new RegExp(`/home/${secondConversationId}\\?e2e=persistent-thread-switch$`)
  );

  pendingResponseResolve({
    threadId: submittedThreadId,
    userMessageId: '40000000-0000-4000-8000-000000000021',
    assistantMessageId: '50000000-0000-4000-8000-000000000021',
    message: answer,
  });

  await page.getByRole('button', { name: /Thread Source Chat/ }).click();
  await expect(page).toHaveURL(
    new RegExp(`/home/${firstConversationId}\\?e2e=persistent-thread-switch$`)
  );

  const restoredMarker = page.locator(
    '[data-testid="inline-thread-link"][data-thread-status="ready"]'
  );
  await expect(restoredMarker).toContainText(PERSISTENT_SWITCH_SELECTION);
  await restoredMarker.click();
  await expect(page.getByTestId('thread-panel')).toContainText(question);
  await expect(page.getByTestId('thread-panel')).toContainText(answer);
});

test('reload during a persistent thread run restores marker metadata from the server', async ({
  page,
}) => {
  const conversationId = 'conversation-inline-threads-fixture';
  const threadId = '10000000-0000-4000-8000-000000000031';
  const run = {
    runId: '20000000-0000-4000-8000-000000000031',
    userMessageId: '30000000-0000-4000-8000-000000000031',
    assistantMessageId: '40000000-0000-4000-8000-000000000031',
    newThreadId: threadId,
    target: {
      kind: 'thread',
      chatId: conversationId,
      conversationId,
      threadId,
      branchId: null,
      branchSourceMessageId: null,
      sourceMessageId: 'assistant-inline-threads-persistent-fixture',
      expectedPredecessorId: null,
    },
  };
  const streamingRun = persistentThreadRunSnapshot(run, 'streaming');
  const completedRun = persistentThreadRunSnapshot(run, 'completed');
  let reconciliationCalls = 0;

  await page.route('**/api/chat-runs/*', async (route) => {
    reconciliationCalls += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ run: completedRun }),
    });
  });
  await mockThreadMessagesRoute(page, async () => ({
    thread: {
      threadId,
      conversationId,
      sourceMessageId: 'assistant-inline-threads-persistent-fixture',
      highlightedText: INLINE_THREADS_SELECTED_TEXT,
      startOffset: 105,
      endOffset: 105 + INLINE_THREADS_SELECTED_TEXT.length,
      selectionStreamVersion: 'v2',
    },
    messages: [
      {
        id: run.userMessageId,
        role: 'user',
        content: 'Recover this thread after refresh.',
        created_at: '2026-07-20T12:04:00.000Z',
      },
      {
        id: run.assistantMessageId,
        role: 'assistant',
        content: 'Recovered persistent thread answer.',
        created_at: '2026-07-20T12:04:01.000Z',
      },
    ],
  }));

  const { messageId } = await gotoHomeFixture(page, 'inline-threads-persistent');
  await page.evaluate((storedRun) => {
    window.sessionStorage.removeItem('keen-persistent-thread-runtime-v1');
    window.sessionStorage.setItem('orchard-chat-runs-v2', JSON.stringify([storedRun]));
  }, streamingRun);
  await page.reload();
  await page.waitForSelector(`[data-message-id="${messageId}"]`);

  const restoredMarker = page.locator(
    `[data-testid="inline-thread-link"][data-thread-id="${threadId}"]`
  );
  await expect(restoredMarker).toContainText(INLINE_THREADS_SELECTED_TEXT);
  expect(reconciliationCalls).toBeGreaterThan(0);

  await restoredMarker.click();
  await expect(page.getByTestId('thread-panel')).toContainText(
    'Recover this thread after refresh.'
  );
  await expect(page.getByTestId('thread-panel')).toContainText(
    'Recovered persistent thread answer.'
  );
});

test('persistent error markers survive reload and reopen with cached thread state', async ({ page }) => {
  const question = 'Why did this request fail?';
  const errorMessage = 'Thread request failed.';
  let failedThreadId = null;
  let failedUserMessageId = null;

  await mockChatRoute(page, async (body) => {
    expect(body.message).toBe(question);
    failedThreadId = body.run.newThreadId;
    failedUserMessageId = body.run.userMessageId;
    return {
      status: 500,
      json: {
        error: errorMessage,
        threadId: failedThreadId,
      },
    };
  });

  await mockThreadMessagesRoute(page, async ({ threadId }) => {
    expect(threadId).toBe(failedThreadId);
    return {
      messages: [
        {
          id: failedUserMessageId,
          role: 'user',
          content: question,
          created_at: '2026-04-05T09:40:01.000Z',
        },
      ],
    };
  });

  const { messageId, selectedText } = await gotoHomeFixture(page, 'inline-threads-persistent');
  await selectTextInMessage(page, messageId, selectedText);
  await page.getByTestId('selection-popover-input').fill(question);
  await page.getByTestId('selection-popover-input').press('Enter');

  const errorMarker = page.locator(
    `[data-testid="inline-thread-link"][data-thread-id="${failedThreadId}"][data-thread-status="error"]`
  );
  await expect(errorMarker).toContainText(selectedText);
  await expect(page.getByTestId('thread-panel')).toContainText(errorMessage);

  await page.reload();
  await page.waitForSelector(`[data-message-id="${messageId}"]`);

  const reloadedErrorMarker = page.locator(
    `[data-testid="inline-thread-link"][data-thread-id="${failedThreadId}"][data-thread-status="error"]`
  );
  await expect(reloadedErrorMarker).toContainText(selectedText);

  await reloadedErrorMarker.click();
  await expect(page.getByTestId('thread-panel')).toHaveAttribute('data-state', 'open');
  await expect(page.getByTestId('thread-panel')).toContainText(question);
  await expect(page.getByTestId('thread-panel')).toContainText(errorMessage);
});

test('renders a persisted inline thread from v2 offsets in an ordered list', async ({ page }) => {
  await mockThreadMessagesRoute(page, async ({ threadId }) => {
    expect(threadId).toBe('persisted-thread-list-marker-1');
    return {
      messages: [
        {
          id: 'persisted-user-list-1',
          role: 'user',
          content: 'Explain that line.',
          created_at: '2026-04-05T09:10:01.000Z',
        },
        {
          id: 'persisted-assistant-list-1',
          role: 'assistant',
          content: 'It means promise callbacks finish before the browser paints again.',
          created_at: '2026-04-05T09:10:02.000Z',
        },
      ],
    };
  });

  const { selectedText } = await gotoHomeFixture(page, 'inline-threads-offset-render');
  const threadLink = page.getByTestId('inline-thread-link');

  await expect(threadLink).toContainText(selectedText);
  await threadLink.click();

  await expect(page.getByTestId('thread-panel')).toHaveAttribute('data-state', 'open');
  await expect(page.getByTestId('thread-panel')).toContainText('Explain that line.');
  await expect(page.getByTestId('thread-panel')).toContainText(
    'It means promise callbacks finish before the browser paints again.'
  );
});

test('renders a persisted inline thread on the repeated occurrence selected by offsets', async ({ page }) => {
  await mockThreadMessagesRoute(page, async ({ threadId }) => {
    expect(threadId).toBe('persisted-thread-repeated-text-1');
    return {
      messages: [
        {
          id: 'persisted-user-repeated-1',
          role: 'user',
          content: 'Which occurrence matters here?',
          created_at: '2026-04-05T09:20:01.000Z',
        },
        {
          id: 'persisted-assistant-repeated-1',
          role: 'assistant',
          content: 'The second occurrence is the one tied to the thread.',
          created_at: '2026-04-05T09:20:02.000Z',
        },
      ],
    };
  });

  const { messageId, selectedText, expectedLinkOffset } = await gotoHomeFixture(
    page,
    'inline-threads-repeated-text'
  );
  const threadLink = page.getByTestId('inline-thread-link');

  await expect(threadLink).toContainText(selectedText);
  await expect(await page.getByTestId('inline-thread-link').count()).toBe(1);

  const startOffset = await getInlineThreadStartOffset(
    page,
    messageId,
    'persisted-thread-repeated-text-1'
  );
  expect(startOffset).toBe(expectedLinkOffset);

  await threadLink.click();
  await expect(page.getByTestId('thread-panel')).toHaveAttribute('data-state', 'open');
  await expect(page.getByTestId('thread-panel')).toContainText(
    'The second occurrence is the one tied to the thread.'
  );
});

test('renders a persisted inline thread from v2 offsets in a bullet list', async ({ page }) => {
  await mockThreadMessagesRoute(page, async ({ threadId }) => {
    expect(threadId).toBe('persisted-thread-bullet-list-1');
    return {
      messages: [
        {
          id: 'persisted-user-bullet-1',
          role: 'user',
          content: 'What does that bullet point mean?',
          created_at: '2026-04-05T09:30:01.000Z',
        },
        {
          id: 'persisted-assistant-bullet-1',
          role: 'assistant',
          content: 'It means queued microtasks can postpone when paint becomes visible.',
          created_at: '2026-04-05T09:30:02.000Z',
        },
      ],
    };
  });

  const { selectedText } = await gotoHomeFixture(page, 'inline-threads-bullet-list');
  const threadLink = page.getByTestId('inline-thread-link');

  await expect(threadLink).toContainText(selectedText);
  await threadLink.click();

  await expect(page.getByTestId('thread-panel')).toHaveAttribute('data-state', 'open');
  await expect(page.getByTestId('thread-panel')).toContainText(
    'It means queued microtasks can postpone when paint becomes visible.'
  );
});

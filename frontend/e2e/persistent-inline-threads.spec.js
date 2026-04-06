const { test, expect } = require('@playwright/test');
const {
  mockChatRoute,
  mockThreadMessagesRoute,
} = require('./helpers/chatMocks');
const { gotoHomeFixture } = require('./helpers/homeFixture');
const { selectTextInMessage } = require('./helpers/selectText');

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

  await mockChatRoute(page, async (body) => {
    expect(body.concise).toBeUndefined();
    expect(body.message).toBe(question);
    expect(body.conversationId).toBe('conversation-inline-threads-fixture');

    return {
      threadId: 'persisted-thread-1',
      userMessageId: 'persisted-user-1',
      assistantMessageId: 'persisted-assistant-1',
      message: answer,
    };
  });

  await mockThreadMessagesRoute(page, async ({ threadId }) => {
    expect(threadId).toBe('persisted-thread-1');
    return {
      messages: [
        {
          id: 'persisted-user-1',
          role: 'user',
          content: question,
          created_at: '2026-04-05T09:00:01.000Z',
        },
        {
          id: 'persisted-assistant-1',
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
  await page.keyboard.press('Control+L');

  await expect(page.getByTestId('thread-panel')).toHaveAttribute('data-state', 'open');
  await page.getByTestId('thread-panel-input').press('Enter');
  await expect(page.getByTestId('thread-panel')).toContainText(answer);

  await page.keyboard.press('Control+L');
  await expect(page.getByTestId('thread-panel')).toHaveAttribute('data-state', 'closed');

  const threadLink = page.getByTestId('inline-thread-link');
  await expect(threadLink).toContainText(selectedText);
  await threadLink.click();

  await expect(page.getByTestId('thread-panel')).toHaveAttribute('data-state', 'open');
  await expect(page.getByTestId('thread-panel')).toContainText(question);
  await expect(page.getByTestId('thread-panel')).toContainText(answer);
});

test('renders a persisted inline thread from offsets when highlighted text includes a list marker', async ({ page }) => {
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

test('renders a persisted inline thread from offsets when highlighted text includes a bullet marker', async ({ page }) => {
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

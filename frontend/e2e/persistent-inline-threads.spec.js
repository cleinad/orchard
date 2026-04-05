const { test, expect } = require('@playwright/test');
const {
  mockChatRoute,
  mockThreadMessagesRoute,
} = require('./helpers/chatMocks');
const { gotoHomeFixture } = require('./helpers/homeFixture');
const { selectTextInMessage } = require('./helpers/selectText');

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

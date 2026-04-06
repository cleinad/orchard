const { test, expect } = require('@playwright/test');
const { deferred, mockChatRoute } = require('./helpers/chatMocks');
const { gotoHomeFixture } = require('./helpers/homeFixture');
const {
  hasPersistentSelectionHighlight,
  selectTextInMessage,
} = require('./helpers/selectText');

test('promotes an unsent popover draft into the thread panel', async ({ page }) => {
  const { messageId, selectedText } = await gotoHomeFixture(page);

  await selectTextInMessage(page, messageId, selectedText);
  await expect(page.getByTestId('selection-popover')).toBeVisible();
  await expect.poll(() => hasPersistentSelectionHighlight(page)).toBe(true);

  const draft = 'Why does that happen?';
  await page.getByTestId('selection-popover-input').fill(draft);
  await page.keyboard.press('Control+L');

  await expect(page.getByTestId('thread-panel')).toHaveAttribute('data-state', 'open');
  await expect(page.getByTestId('thread-panel-input')).toHaveValue(draft);
  await expect(page.getByTestId('selection-popover')).toHaveCount(0);
  await expect.poll(() => hasPersistentSelectionHighlight(page)).toBe(true);
});

test('preserves an in-flight popover request when promoting to the thread panel', async ({ page }) => {
  const response = deferred();
  const question = 'Why does that happen?';

  await mockChatRoute(page, async (body) => {
    expect(body.concise).toBe(true);
    expect(body.message).toBe(question);
    return response.promise;
  });

  const { messageId, selectedText } = await gotoHomeFixture(page);
  await selectTextInMessage(page, messageId, selectedText);
  await page.getByTestId('selection-popover-input').fill(question);
  await page.getByTestId('selection-popover-input').press('Enter');

  await expect(page.getByTestId('selection-popover-loading')).toBeVisible();
  await page.keyboard.press('Control+L');

  await expect(page.getByTestId('thread-panel')).toHaveAttribute('data-state', 'open');
  await expect(page.getByTestId('thread-panel')).toContainText(question);
  await expect(page.getByTestId('thread-panel-loading')).toBeVisible();
  await expect(page.getByTestId('thread-panel-input')).toHaveValue('');

  response.resolve({
    message: 'Because microtasks flush before rendering.',
    userMessageId: 'user-loading-1',
    assistantMessageId: 'assistant-loading-1',
  });

  await expect(page.getByTestId('thread-panel')).toContainText(
    'Because microtasks flush before rendering.'
  );
});

test('seeds a completed popover exchange into the thread panel and preserves follow-up draft input', async ({ page }) => {
  const question = 'Why does that happen?';
  const answer = 'Because the browser drains microtasks before it paints the next frame.';
  const followUp = 'Does that affect React state batching?';

  await mockChatRoute(page, async (body) => {
    expect(body.concise).toBe(true);
    expect(body.message).toBe(question);
    return {
      message: answer,
      userMessageId: 'user-complete-1',
      assistantMessageId: 'assistant-complete-1',
    };
  });

  const { messageId, selectedText } = await gotoHomeFixture(page);
  await selectTextInMessage(page, messageId, selectedText);
  await page.getByTestId('selection-popover-input').fill(question);
  await page.getByTestId('selection-popover-input').press('Enter');

  await expect(page.getByTestId('selection-popover-follow-up-input')).toBeVisible();
  await expect(page.getByTestId('selection-popover')).toContainText(answer);

  await page.getByTestId('selection-popover-follow-up-input').fill(followUp);
  await page.keyboard.press('Control+L');

  await expect(page.getByTestId('thread-panel')).toHaveAttribute('data-state', 'open');
  await expect(page.getByTestId('thread-panel')).toContainText(question);
  await expect(page.getByTestId('thread-panel')).toContainText(answer);
  await expect(page.getByTestId('thread-panel-input')).toHaveValue(followUp);

  await page.keyboard.press('Control+L');
  await expect(page.getByTestId('thread-panel')).toHaveAttribute('data-state', 'closed');
});

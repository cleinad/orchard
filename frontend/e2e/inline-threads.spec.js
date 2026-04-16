const { test, expect } = require('@playwright/test');
const { deferred, mockChatRoute } = require('./helpers/chatMocks');
const { gotoHomeFixture } = require('./helpers/homeFixture');
const {
  hasPersistentSelectionHighlight,
  selectTextInMessage,
} = require('./helpers/selectText');

const PRIMARY_SELECTION_TEXT = 'microtasks run before the browser paints the next frame';
const SECONDARY_SELECTION_TEXT = 'promise callbacks can update state before rendering catches up.';

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

test('submitting a selection question opens the thread panel immediately and shows a loading inline marker', async ({ page }) => {
  const response = deferred();
  const question = 'Why does that happen?';

  await mockChatRoute(page, async (body) => {
    expect(body.concise).toBeUndefined();
    expect(body.message).toBe(question);
    return response.promise;
  });

  const { messageId, selectedText } = await gotoHomeFixture(page);
  await selectTextInMessage(page, messageId, selectedText);
  await page.getByTestId('selection-popover-input').fill(question);
  await page.getByTestId('selection-popover-input').press('Enter');

  await expect(page.getByTestId('selection-popover')).toHaveCount(0);
  await expect(page.getByTestId('thread-panel')).toHaveAttribute('data-state', 'open');
  await expect(page.getByTestId('thread-panel')).toContainText(question);
  await expect(page.getByTestId('thread-panel-loading')).toBeVisible();
  await expect(
    page.locator('[data-testid="inline-thread-link"][data-thread-status="loading"]')
  ).toContainText(selectedText);

  response.resolve({
    message: 'Because microtasks flush before rendering.',
    userMessageId: 'user-loading-1',
    assistantMessageId: 'assistant-loading-1',
  });

  await expect(page.getByTestId('thread-panel')).toContainText(
    'Because microtasks flush before rendering.'
  );
  await expect(
    page.locator('[data-testid="inline-thread-link"][data-thread-status="ready"]')
  ).toContainText(selectedText);
});

test('the latest submitted thread owns the panel while earlier threads finish in the background', async ({ page }) => {
  const firstQuestion = 'What does the timing mean?';
  const secondQuestion = 'How does that affect state updates?';
  const firstResponse = deferred();
  const secondResponse = deferred();

  await mockChatRoute(page, async (body) => {
    if (body.message === firstQuestion) {
      return firstResponse.promise;
    }

    if (body.message === secondQuestion) {
      return secondResponse.promise;
    }

    throw new Error(`Unexpected thread question: ${body.message}`);
  });

  const { messageId } = await gotoHomeFixture(page);

  await selectTextInMessage(page, messageId, PRIMARY_SELECTION_TEXT);
  await page.getByTestId('selection-popover-input').fill(firstQuestion);
  await page.getByTestId('selection-popover-input').press('Enter');

  await expect(page.getByTestId('thread-panel')).toContainText(firstQuestion);
  await expect(page.getByTestId('thread-panel-loading')).toBeVisible();

  await selectTextInMessage(page, messageId, SECONDARY_SELECTION_TEXT);
  await page.getByTestId('selection-popover-input').fill(secondQuestion);
  await page.getByTestId('selection-popover-input').press('Enter');

  await expect(page.getByTestId('thread-panel')).toContainText(secondQuestion);
  await expect(page.getByTestId('thread-panel')).not.toContainText(
    'It means the browser drains queued microtasks before paint.'
  );

  firstResponse.resolve({
    message: 'It means the browser drains queued microtasks before paint.',
    userMessageId: 'user-first-1',
    assistantMessageId: 'assistant-first-1',
  });

  await expect(
    page.locator('[data-testid="inline-thread-link"][data-thread-status="ready"]')
  ).toContainText(PRIMARY_SELECTION_TEXT);
  await expect(page.getByTestId('thread-panel')).toContainText(secondQuestion);
  await expect(page.getByTestId('thread-panel')).not.toContainText(
    'It means the browser drains queued microtasks before paint.'
  );

  secondResponse.resolve({
    message: 'It means React can see updates before the next paint happens.',
    userMessageId: 'user-second-1',
    assistantMessageId: 'assistant-second-1',
  });

  await expect(page.getByTestId('thread-panel')).toContainText(
    'It means React can see updates before the next paint happens.'
  );
});

test('temporary thread results persist if you switch chats before the answer resolves', async ({ page }) => {
  const question = 'What should I watch for here?';
  const answer = 'Watch for microtasks finishing before paint, even if you leave the chat.';
  const response = deferred();

  await mockChatRoute(page, async (body) => {
    expect(body.message).toBe(question);
    return response.promise;
  });

  const { messageId } = await gotoHomeFixture(page);
  await selectTextInMessage(page, messageId, PRIMARY_SELECTION_TEXT);
  await page.getByTestId('selection-popover-input').fill(question);
  await page.getByTestId('selection-popover-input').press('Enter');

  await expect(
    page.locator('[data-testid="inline-thread-link"][data-thread-status="loading"]')
  ).toContainText(PRIMARY_SELECTION_TEXT);

  await page.getByLabel('New temporary chat').click();
  await expect(page.getByRole('heading', { name: 'Temporary chat' })).toBeVisible();

  response.resolve({
    message: answer,
    userMessageId: 'temp-switch-user-1',
    assistantMessageId: 'temp-switch-assistant-1',
  });

  const temporaryChatButtons = page.getByRole('button', { name: /^Temp Temporary chat/ });
  await expect(temporaryChatButtons).toHaveCount(2);
  await temporaryChatButtons.first().evaluate((button) => button.click());

  const readyMarker = page.locator(
    '[data-testid="inline-thread-link"][data-thread-status="ready"]'
  );
  await expect(readyMarker).toContainText(PRIMARY_SELECTION_TEXT);

  await readyMarker.click();
  await expect(page.getByTestId('thread-panel')).toContainText(question);
  await expect(page.getByTestId('thread-panel')).toContainText(answer);
});

test('thread panel follow-ups can be sent with the send button', async ({ page }) => {
  const firstQuestion = 'Why does that happen?';
  const followUp = 'What does that change in React?';
  const seenMessages = [];

  await mockChatRoute(page, async (body) => {
    seenMessages.push(body.message);

    if (body.message === firstQuestion) {
      return {
        message: 'Because microtasks flush before rendering.',
        userMessageId: 'send-button-user-1',
        assistantMessageId: 'send-button-assistant-1',
      };
    }

    if (body.message === followUp) {
      return {
        message: 'It lets state updates settle before the browser paints.',
        userMessageId: 'send-button-user-2',
        assistantMessageId: 'send-button-assistant-2',
      };
    }

    throw new Error(`Unexpected thread question: ${body.message}`);
  });

  const { messageId, selectedText } = await gotoHomeFixture(page);
  await selectTextInMessage(page, messageId, selectedText);
  await page.getByTestId('selection-popover-input').fill(firstQuestion);
  await page.getByTestId('selection-popover-input').press('Enter');

  await expect(page.getByTestId('thread-panel')).toContainText(
    'Because microtasks flush before rendering.'
  );

  await page.getByTestId('thread-panel-input').fill(followUp);
  await page.getByTestId('thread-panel-send').click();

  await expect(page.getByTestId('thread-panel')).toContainText(
    'It lets state updates settle before the browser paints.'
  );
  expect(seenMessages).toEqual([firstQuestion, followUp]);
});

test('a failed thread keeps an error marker and can be reopened', async ({ page }) => {
  const question = 'Why is this failing?';

  await mockChatRoute(page, async (body) => {
    expect(body.message).toBe(question);
    return {
      status: 500,
      json: {
        error: 'Thread request failed.',
      },
    };
  });

  const { messageId, selectedText } = await gotoHomeFixture(page);
  await selectTextInMessage(page, messageId, selectedText);
  await page.getByTestId('selection-popover-input').fill(question);
  await page.getByTestId('selection-popover-input').press('Enter');

  const errorMarker = page.locator('[data-testid="inline-thread-link"][data-thread-status="error"]');
  await expect(errorMarker).toContainText(selectedText);
  await expect(page.getByTestId('thread-panel')).toContainText('Thread request failed.');

  await page.keyboard.press('Control+L');
  await expect(page.getByTestId('thread-panel')).toHaveAttribute('data-state', 'closed');

  await errorMarker.click();
  await expect(page.getByTestId('thread-panel')).toHaveAttribute('data-state', 'open');
  await expect(page.getByTestId('thread-panel')).toContainText(question);
  await expect(page.getByTestId('thread-panel')).toContainText('Thread request failed.');
});

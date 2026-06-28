const { test, expect } = require('@playwright/test');
const { deferred, mockChatRoute } = require('./helpers/chatMocks');
const { gotoHomeFixture } = require('./helpers/homeFixture');
const {
  hasPersistentSelectionHighlight,
  selectTextInMessage,
} = require('./helpers/selectText');

const PRIMARY_SELECTION_TEXT = 'microtasks run before the browser paints the next frame';
const SECONDARY_SELECTION_TEXT = 'promise callbacks can update state before rendering catches up.';
const FRACTION_MATH_SELECTION = 'bc−ad';
const TABLE_HEADER_SELECTION = 'Phase\tTrigger\tResult';
const TABLE_ROW_SELECTION = 'Microtask\tPromise callback\tRuns before paint';
const PARAGRAPH_TO_TABLE_SELECTION = 'comparison:\nPhase\tTrigger';
const TABLE_TO_PARAGRAPH_SELECTION = 'Pixels become visible\nThe important bit';
const RICH_SELECTION_CASES = [
  'Paragraph text includes',
  'queueMicrotask()',
  'scheduler priority',
  'Ordered follow-up repeats offsets.',
  'const paint = await nextFrame();',
  'queueMicrotask(() => setReady(true));',
  'a2',
  'E=mc2',
  FRACTION_MATH_SELECTION,
  '[1]',
];

async function getTableMetrics(table) {
  return table.evaluate((tableEl) => {
    const round = (value) => Math.round(value * 100) / 100;
    const rect = tableEl.getBoundingClientRect();

    return {
      width: round(rect.width),
      height: round(rect.height),
      rows: Array.from(tableEl.querySelectorAll('tr')).map((row) =>
        round(row.getBoundingClientRect().height)
      ),
    };
  });
}

function expectStableTableMetrics(after, before) {
  expect(Math.abs(after.width - before.width)).toBeLessThanOrEqual(1);
  expect(after.height).toBeLessThanOrEqual(before.height + 8);
  expect(after.rows.length).toBe(before.rows.length);

  after.rows.forEach((height, index) => {
    expect(height).toBeLessThanOrEqual(before.rows[index] + 8);
  });
}

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

test('captures selections across rich markdown renderers', async ({ page }) => {
  const { messageId } = await gotoHomeFixture(page, 'inline-threads-rich-selection');

  for (const selectedText of RICH_SELECTION_CASES) {
    await selectTextInMessage(page, messageId, selectedText);
    await expect(page.getByTestId('selection-popover')).toBeVisible();
    await expect(page.getByTestId('selection-popover')).toContainText(selectedText);
    await expect.poll(() => hasPersistentSelectionHighlight(page)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('selection-popover')).toHaveCount(0);
  }
});

test('copy after source selection and paste into the popover input keep native clipboard behavior', async ({
  context,
  page,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const { messageId } = await gotoHomeFixture(page, 'inline-threads-rich-selection');
  const selectedText = 'const paint = await nextFrame();';

  await selectTextInMessage(page, messageId, selectedText);
  await expect(page.getByTestId('selection-popover')).toBeVisible();

  await page.keyboard.press('ControlOrMeta+C');
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(selectedText);

  await page.evaluate(() => navigator.clipboard.writeText('How does this affect paint?'));
  await page.getByTestId('selection-popover-input').click();
  await page.keyboard.press('ControlOrMeta+V');
  await expect(page.getByTestId('selection-popover-input')).toHaveValue(
    'How does this affect paint?'
  );

  await page.keyboard.press('Escape');
  await selectTextInMessage(page, messageId, 'E=mc2');
  await expect(page.getByTestId('selection-popover')).toBeVisible();
  await page.keyboard.press('ControlOrMeta+C');
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('E=mc2');
});

test('code-block copy button still copies only code text', async ({ context, page }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await gotoHomeFixture(page, 'inline-threads-rich-selection');

  await page.getByRole('button', { name: 'Copy JavaScript code' }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(
    'const paint = await nextFrame();\nqueueMicrotask(() => setReady(true));'
  );
});

test('renders inline markers for code and math selections from offsets', async ({ page }) => {
  await mockChatRoute(page, async (body) => {
    return {
      message: `Answer for ${body.message}`,
      userMessageId: `user-${body.message}`,
      assistantMessageId: `assistant-${body.message}`,
    };
  });

  const { messageId } = await gotoHomeFixture(page, 'inline-threads-rich-selection');

  await selectTextInMessage(page, messageId, 'const paint = await nextFrame();');
  await page.getByTestId('selection-popover-input').fill('code-marker');
  await page.getByTestId('selection-popover-input').press('Enter');

  const messageContent = page.locator(`[data-message-id="${messageId}"] [data-message-content]`);
  await expect(messageContent).toHaveAttribute('data-range-thread-highlights', 'true');

  const codeMarkerFragments = page.locator('pre code [data-testid="inline-thread-link"]');
  await expect.poll(() => codeMarkerFragments.count()).toBeGreaterThan(1);
  const codeMarkerText = await codeMarkerFragments.evaluateAll((nodes) =>
    nodes.map((node) => node.textContent || '').join('')
  );
  expect(codeMarkerText).toContain('const');
  expect(codeMarkerText).toContain('nextFrame');
  expect(codeMarkerText).toContain('();');
  await expect
    .poll(() =>
      codeMarkerFragments.first().evaluate((node) => {
        const style = window.getComputedStyle(node);
        return {
          backgroundColor: style.backgroundColor,
          boxShadow: style.boxShadow,
        };
      })
    )
    .toEqual({
      backgroundColor: 'rgba(0, 0, 0, 0)',
      boxShadow: 'none',
    });

  await selectTextInMessage(page, messageId, 'E=mc2');
  await page.getByTestId('selection-popover-input').fill('math-marker');
  await page.getByTestId('selection-popover-input').press('Enter');

  const mathMarkerFragments = page.locator('.katex-html [data-testid="inline-thread-link"]');
  await expect.poll(() => mathMarkerFragments.count()).toBeGreaterThan(1);
  const mathMarkerText = await mathMarkerFragments.evaluateAll((nodes) =>
    nodes.map((node) => node.textContent || '').join('')
  );
  expect(mathMarkerText).toBe('E=mc2');
  const mathMarkerStyles = await mathMarkerFragments.first().evaluate((node) => {
    const style = window.getComputedStyle(node);
    return {
      backgroundColor: style.backgroundColor,
      borderRadius: style.borderRadius,
      boxShadow: style.boxShadow,
    };
  });
  expect(mathMarkerStyles.backgroundColor).toBe('rgba(0, 0, 0, 0)');
  expect(mathMarkerStyles.borderRadius).toBe('2px');
  expect(mathMarkerStyles.boxShadow).toBe('none');

  await selectTextInMessage(page, messageId, FRACTION_MATH_SELECTION);
  await page.getByTestId('selection-popover-input').fill('fraction-marker');
  await page.getByTestId('selection-popover-input').press('Enter');

  const fractionMarkerFragments = page.locator('.katex-html [data-testid="inline-thread-link"]');
  await expect.poll(() => fractionMarkerFragments.count()).toBeGreaterThan(1);
  const fractionMarkerText = await fractionMarkerFragments.evaluateAll((nodes) =>
    nodes.map((node) => node.textContent || '').join('')
  );
  expect(fractionMarkerText).toContain(FRACTION_MATH_SELECTION);
  const fractionMarkerStyles = await fractionMarkerFragments.last().evaluate((node) => {
    const style = window.getComputedStyle(node);
    return {
      backgroundColor: style.backgroundColor,
      borderRadius: style.borderRadius,
      boxShadow: style.boxShadow,
    };
  });
  expect(fractionMarkerStyles.backgroundColor).toBe('rgba(0, 0, 0, 0)');
  expect(fractionMarkerStyles.borderRadius).toBe('2px');
  expect(fractionMarkerStyles.boxShadow).toBe('none');
});

test('captures table selections with spreadsheet text and smooth persisted highlighting', async ({
  page,
}) => {
  const consoleErrors = [];
  page.on('console', (message) => {
    if (
      message.type() === 'error'
      && /cannot be a child|hydration|nested <span>/i.test(message.text())
    ) {
      consoleErrors.push(message.text());
    }
  });

  const headerQuestion = 'Explain this table header.';
  const rowQuestion = 'Explain this table row.';
  const headerAnswer = 'The header names the table dimensions.';
  const rowAnswer = 'Microtasks run after the current task but before paint becomes visible.';

  await mockChatRoute(page, async (body) => {
    expect(body.conversationId).toBe('conversation-inline-threads-table-fixture');
    expect(body.selectionStreamVersion).toBe('markdown-structure-v2');

    if (body.highlightedText === TABLE_HEADER_SELECTION) {
      expect(body.message).toBe(headerQuestion);
      return {
        threadId: 'persisted-thread-table-header-1',
        userMessageId: 'persisted-table-header-user-1',
        assistantMessageId: 'persisted-table-header-assistant-1',
        message: headerAnswer,
      };
    }

    expect(body.message).toBe(rowQuestion);
    expect(body.highlightedText).toBe(TABLE_ROW_SELECTION);
    return {
      threadId: 'persisted-thread-table-1',
      userMessageId: 'persisted-table-user-1',
      assistantMessageId: 'persisted-table-assistant-1',
      message: rowAnswer,
    };
  });

  const { messageId, selectedText } = await gotoHomeFixture(page, 'inline-threads-table-selection');
  expect(selectedText).toBe(TABLE_ROW_SELECTION);
  const table = page.locator(`[data-message-id="${messageId}"] table`);
  await expect(table).toBeVisible();

  const baselineMetrics = await getTableMetrics(table);
  const invalidTableMarkers = page.locator(
    [
      'table > [data-testid="inline-thread-link"]',
      'thead > [data-testid="inline-thread-link"]',
      'tbody > [data-testid="inline-thread-link"]',
      'tfoot > [data-testid="inline-thread-link"]',
      'tr > [data-testid="inline-thread-link"]',
    ].join(',')
  );

  await selectTextInMessage(page, messageId, TABLE_HEADER_SELECTION);
  await page.getByTestId('selection-popover-input').fill(headerQuestion);
  await page.getByTestId('selection-popover-input').press('Enter');

  const headerMarkerFragments = page.locator('th [data-testid="inline-thread-link"]');
  await expect.poll(() => headerMarkerFragments.count()).toBeGreaterThan(0);
  await expect(headerMarkerFragments.first()).toContainText('Phase');
  await expect(invalidTableMarkers).toHaveCount(0);

  await selectTextInMessage(page, messageId, selectedText);
  await page.getByTestId('selection-popover-input').fill(rowQuestion);
  await page.getByTestId('selection-popover-input').press('Enter');

  const messageContent = page.locator(`[data-message-id="${messageId}"] [data-message-content]`);
  await expect(messageContent).toHaveAttribute('data-range-thread-highlights', 'true');
  await expect(invalidTableMarkers).toHaveCount(0);

  const tableMarkerFragments = page.locator('td [data-testid="inline-thread-link"]');
  await expect.poll(() => tableMarkerFragments.count()).toBeGreaterThan(0);
  await expect(tableMarkerFragments.first()).toContainText('Microtask');

  const highlightedMetrics = await getTableMetrics(table);
  expectStableTableMetrics(highlightedMetrics, baselineMetrics);
  expect(consoleErrors).toEqual([]);

  await expect
    .poll(() =>
      tableMarkerFragments.first().evaluate((node) => window.getComputedStyle(node).backgroundColor)
    )
    .toBe('rgba(0, 0, 0, 0)');

  await tableMarkerFragments.first().click();
  await expect(page.getByTestId('thread-panel')).toHaveAttribute('data-state', 'open');
  await expect(page.getByTestId('thread-panel')).toContainText(rowQuestion);
  await expect(page.getByTestId('thread-panel')).toContainText(rowAnswer);
});

test('keeps table structure valid for paragraph-table boundary selections', async ({ page }) => {
  const consoleErrors = [];
  page.on('console', (message) => {
    if (
      message.type() === 'error'
      && /cannot be a child|hydration|nested <span>/i.test(message.text())
    ) {
      consoleErrors.push(message.text());
    }
  });

  const cases = new Map([
    [
      PARAGRAPH_TO_TABLE_SELECTION,
      {
        question: 'Explain paragraph to table.',
        answer: 'The paragraph introduces the first table columns.',
        threadId: 'persisted-thread-table-boundary-before-1',
      },
    ],
    [
      TABLE_TO_PARAGRAPH_SELECTION,
      {
        question: 'Explain table to paragraph.',
        answer: 'The final table row leads into the summary paragraph.',
        threadId: 'persisted-thread-table-boundary-after-1',
      },
    ],
  ]);

  await mockChatRoute(page, async (body) => {
    expect(body.conversationId).toBe('conversation-inline-threads-table-fixture');
    expect(body.selectionStreamVersion).toBe('markdown-structure-v2');

    const match = cases.get(body.highlightedText);
    expect(match).toBeTruthy();
    expect(body.message).toBe(match.question);

    return {
      threadId: match.threadId,
      userMessageId: `${match.threadId}-user`,
      assistantMessageId: `${match.threadId}-assistant`,
      message: match.answer,
    };
  });

  const { messageId } = await gotoHomeFixture(page, 'inline-threads-table-selection');
  const table = page.locator(`[data-message-id="${messageId}"] table`);
  await expect(table).toBeVisible();

  const baselineMetrics = await getTableMetrics(table);
  const invalidTableMarkers = page.locator(
    [
      'table > [data-testid="inline-thread-link"]',
      'thead > [data-testid="inline-thread-link"]',
      'tbody > [data-testid="inline-thread-link"]',
      'tfoot > [data-testid="inline-thread-link"]',
      'tr > [data-testid="inline-thread-link"]',
    ].join(',')
  );

  for (const [selectionText, { question }] of cases) {
    await selectTextInMessage(page, messageId, selectionText);
    await page.getByTestId('selection-popover-input').fill(question);
    await page.getByTestId('selection-popover-input').press('Enter');
    await expect(invalidTableMarkers).toHaveCount(0);
  }

  const highlightedMetrics = await getTableMetrics(table);
  expectStableTableMetrics(highlightedMetrics, baselineMetrics);
  expect(consoleErrors).toEqual([]);
});
